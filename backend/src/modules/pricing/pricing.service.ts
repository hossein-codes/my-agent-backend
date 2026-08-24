import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCodes } from '../../common/errors/error-codes';

/**
 * Anything that can run a Prisma read: the client itself, or a transaction
 * handle. Written as a union of the two real call-site types rather than a
 * structural `Pick`, so it stays correct whether we are inside a transaction
 * or not.
 */
export type PrismaReader = PrismaService | Prisma.TransactionClient;

export interface ResolvedPrice {
  variantId: string;
  basePrice: number;
  salePrice: number | null;
  /** What the customer actually pays per unit. */
  unitPrice: number;
  /** Percentage off, for badge display. 0 when not on sale. */
  discountPercent: number;
  onSale: boolean;
}

/**
 * Authoritative pricing (spec §6/§7).
 *
 * Rules this enforces:
 *   - the CURRENT price is the `VariantPrice` row with `effectiveTo IS NULL`
 *   - prices are Integer Toman, never floats — all math stays integer
 *   - a sale price must be strictly below base to count as a sale, so a
 *     stale `salePrice == basePrice` row cannot render a fake "0% off" badge
 *   - `Product.basePrice` is a catalog display default ONLY; it is never
 *     used to charge anyone
 */
@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns null when the variant has no current price row. */
  async currentPriceOrNull(client: PrismaReader, variantId: string): Promise<ResolvedPrice | null> {
    const row = await client.variantPrice.findFirst({
      where: { variantId, effectiveTo: null },
      orderBy: { effectiveFrom: 'desc' },
      select: { basePrice: true, salePrice: true },
    });
    if (!row) return null;
    return this.resolve(variantId, row.basePrice, row.salePrice);
  }

  /** Same as above but throws when missing — used where a price is mandatory. */
  async currentPrice(client: PrismaReader, variantId: string): Promise<ResolvedPrice> {
    const price = await this.currentPriceOrNull(client, variantId);
    if (!price) {
      throw new AppError(ErrorCodes.PRODUCT_NOT_AVAILABLE, 409, 'Variant has no current price');
    }
    return price;
  }

  /** Batched lookup — avoids an N+1 when rendering a product list or cart. */
  async currentPrices(client: PrismaReader, variantIds: string[]): Promise<Map<string, ResolvedPrice>> {
    if (variantIds.length === 0) return new Map();
    const rows = await client.variantPrice.findMany({
      where: { variantId: { in: variantIds }, effectiveTo: null },
      select: { variantId: true, basePrice: true, salePrice: true },
    });
    const map = new Map<string, ResolvedPrice>();
    for (const r of rows as Array<{ variantId: string; basePrice: number; salePrice: number | null }>) {
      map.set(r.variantId, this.resolve(r.variantId, r.basePrice, r.salePrice));
    }
    return map;
  }

  /**
   * Sets a new current price. Closes the outgoing row and inserts the new one
   * in a single transaction so there is never a moment with two current rows
   * (or none). History is never rewritten (spec §20).
   */
  async setPrice(input: {
    variantId: string;
    basePrice: number;
    salePrice?: number | null;
    source?: string;
    actorId?: string | null;
    campaignRuleId?: string | null;
    note?: string | null;
  }): Promise<ResolvedPrice> {
    if (!Number.isInteger(input.basePrice) || input.basePrice < 0) {
      throw AppError.badRequest('basePrice must be a non-negative integer (Toman)');
    }
    const sale = input.salePrice ?? null;
    if (sale !== null && (!Number.isInteger(sale) || sale < 0 || sale > input.basePrice)) {
      throw AppError.badRequest('salePrice must be an integer between 0 and basePrice');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.variantPrice.updateMany({
        where: { variantId: input.variantId, effectiveTo: null },
        data: { effectiveTo: new Date() },
      });
      await tx.variantPrice.create({
        data: {
          variantId: input.variantId,
          basePrice: input.basePrice,
          salePrice: sale,
          source: input.source ?? 'ADMIN',
          actorId: input.actorId ?? null,
          campaignRuleId: input.campaignRuleId ?? null,
          note: input.note ?? null,
        },
      });
    });

    return this.resolve(input.variantId, input.basePrice, sale);
  }

  /** Price history for the admin audit view. */
  async history(variantId: string, limit = 50) {
    const rows = await this.prisma.variantPrice.findMany({
      where: { variantId },
      orderBy: { effectiveFrom: 'desc' },
      take: limit,
    });
    return rows;
  }

  private resolve(variantId: string, basePrice: number, salePrice: number | null): ResolvedPrice {
    const onSale = salePrice !== null && salePrice < basePrice;
    const unitPrice = onSale ? (salePrice as number) : basePrice;
    // Integer percent via round-half-up on Toman values; no float leaks out.
    const discountPercent = onSale && basePrice > 0 ? Math.round(((basePrice - unitPrice) / basePrice) * 100) : 0;
    return { variantId, basePrice, salePrice: onSale ? unitPrice : null, unitPrice, discountPercent, onSale };
  }
}
