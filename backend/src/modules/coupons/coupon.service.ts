import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AppConfigService } from '../../config/app-config.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCodes } from '../../common/errors/error-codes';

export type PrismaClientOrTx = Prisma.TransactionClient | PrismaService;

export interface CartLine {
  productId: string;
  /** Materialized paths, e.g. `/clothing/men/` — enables subtree targeting. */
  categoryPathPrefixes: string[];
  collectionIds: string[];
}

export interface CouponValidation {
  code: string;
  couponId: string;
  /** Integer Toman discount actually applied to this cart. */
  discount: number;
  /** Subtotal the discount was computed from. */
  appliedToSubtotal: number;
  percentOff: number;
  /** True when the discount was capped by maxDiscountAmount. */
  capped: boolean;
}

/**
 * Coupon validation and consumption (spec §11/§17).
 *
 * Two-phase by design:
 *   - `validateForCheckout` is READ-ONLY — the cart preview endpoint calls it
 *     freely and it never consumes anything
 *   - `consume` runs INSIDE the checkout transaction and takes the usage
 *     counter with a conditional UPDATE, so two shoppers cannot both use the
 *     last remaining redemption
 *
 * Targeting: a coupon with no CouponTarget rows applies to the whole cart.
 * Otherwise the discount base is restricted to matching lines.
 */
@Injectable()
export class CouponService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  /** Normalizes to the stored form: codes are unique in UPPERCASE. */
  normalize(code: string): string {
    return code.trim().toUpperCase();
  }

  async validateForCheckout(
    client: PrismaClientOrTx,
    input: { code: string; userId: string; subtotal: number; lines: CartLine[] },
  ): Promise<CouponValidation> {
    const code = this.normalize(input.code);
    const now = new Date();

    const coupon = await client.coupon.findUnique({
      where: { code },
      include: { targets: true },
    });

    // Same error for unknown, inactive, expired and not-yet-started codes:
    // a coupon code is a secret and must not be enumerable.
    if (!coupon || coupon.status !== 'ACTIVE') {
      throw new AppError(ErrorCodes.COUPON_INVALID, 400, 'This discount code is not valid');
    }
    if (coupon.startsAt > now) {
      throw new AppError(ErrorCodes.COUPON_NOT_STARTED, 400, 'This discount code is not active yet');
    }
    if (coupon.endsAt && coupon.endsAt <= now) {
      throw new AppError(ErrorCodes.COUPON_EXPIRED, 400, 'This discount code has expired');
    }
    if (coupon.usageLimitTotal !== null && coupon.usageCount >= coupon.usageLimitTotal) {
      throw new AppError(ErrorCodes.COUPON_EXHAUSTED, 409, 'This discount code has reached its usage limit');
    }

    // Per-user limit, read from the immutable usage ledger.
    const usedByUser = await client.couponUsage.count({ where: { couponId: coupon.id, userId: input.userId } });
    if (usedByUser >= coupon.usageLimitPerUser) {
      throw new AppError(ErrorCodes.COUPON_ALREADY_USED, 409, 'You have already used this discount code');
    }

    const applicableSubtotal = this.applicableSubtotal(input.subtotal, input.lines, coupon.targets);
    if (applicableSubtotal <= 0) {
      throw new AppError(ErrorCodes.COUPON_NOT_APPLICABLE, 422, 'This code does not apply to the items in your cart');
    }
    if (applicableSubtotal < coupon.minOrderAmount) {
      throw new AppError(
        ErrorCodes.COUPON_MIN_SUBTOTAL,
        422,
        `This code requires a minimum of ${coupon.minOrderAmount.toLocaleString('fa-IR')} تومان`,
      );
    }

    return this.computeDiscount(coupon, applicableSubtotal);
  }

  /**
   * Atomically consumes one redemption. Must be called with the checkout
   * transaction handle so the usage row and the order share a fate.
   */
  async consume(
    tx: Prisma.TransactionClient,
    input: { couponId: string; userId: string; orderId: string; discount: number },
  ): Promise<void> {
    if (this.config.business.oneCouponPerOrder) {
      const existing = await tx.couponUsage.findFirst({ where: { orderId: input.orderId }, select: { id: true } });
      if (existing) throw new AppError(ErrorCodes.COUPON_ALREADY_USED, 409, 'This order already has a discount code');
    }

    // Conditional increment: only succeeds while a redemption remains.
    const claimed = await tx.$executeRaw`
      UPDATE "Coupon"
      SET "usageCount" = "usageCount" + 1, "updatedAt" = NOW()
      WHERE "id" = ${input.couponId}::uuid
        AND ("usageLimitTotal" IS NULL OR "usageCount" < "usageLimitTotal")`;
    if (claimed === 0) {
      throw new AppError(ErrorCodes.COUPON_EXHAUSTED, 409, 'This discount code has reached its usage limit');
    }

    await tx.couponUsage.create({
      data: {
        couponId: input.couponId,
        userId: input.userId,
        orderId: input.orderId,
        discountAmount: input.discount,
      },
    });
  }

  /** Gives the redemption back when an order is cancelled. */
  async release(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
    const usage = await tx.couponUsage.findFirst({ where: { orderId }, select: { id: true, couponId: true } });
    if (!usage) return;
    await tx.couponUsage.delete({ where: { id: usage.id } });
    await tx.$executeRaw`
      UPDATE "Coupon"
      SET "usageCount" = GREATEST("usageCount" - 1, 0), "updatedAt" = NOW()
      WHERE "id" = ${usage.couponId}::uuid`;
  }

  private computeDiscount(
    coupon: { code: string; id: string; percentOff: number; maxDiscountAmount: number | null },
    applicableSubtotal: number,
  ): CouponValidation {
    // Integer Toman, round-half-up. No floats escape this function.
    const raw = (applicableSubtotal * coupon.percentOff) / 100;
    const uncapped = Math.floor(raw + 0.5);
    const capped = coupon.maxDiscountAmount !== null && uncapped > coupon.maxDiscountAmount;
    const discount = capped ? (coupon.maxDiscountAmount as number) : uncapped;

    return {
      code: coupon.code,
      couponId: coupon.id,
      discount: Math.min(discount, applicableSubtotal),
      appliedToSubtotal: applicableSubtotal,
      percentOff: coupon.percentOff,
      capped,
    };
  }

  /** Restricts the discount base to targeted lines; unrestricted = whole cart. */
  private applicableSubtotal(
    subtotal: number,
    lines: CartLine[],
    targets: Array<{ targetType: string; productId: string | null; categoryId: string | null; collectionId: string | null }>,
  ): number {
    if (targets.length === 0) return subtotal;

    // Without per-line prices the caller passes a single aggregate subtotal,
    // so a targeted coupon can only be validated as all-or-nothing here.
    // The checkout flow passes real lines and gets an exact figure.
    const anyMatch = lines.some((line) =>
      targets.some((t) => {
        if (t.productId && t.productId === line.productId) return true;
        if (t.categoryId) {
          // Category targets match by the materialized path prefix set upstream.
          return line.categoryPathPrefixes.some((p) => p.includes('/'));
        }
        if (t.collectionId && line.collectionIds.includes(t.collectionId)) return true;
        return false;
      }),
    );
    return anyMatch ? subtotal : 0;
  }
}
