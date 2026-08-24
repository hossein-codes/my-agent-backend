import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCodes } from '../../common/errors/error-codes';

export interface ShippingQuote {
  methodId: string;
  name: string;
  carrier: string | null;
  /** Integer Toman, 0 when the free-shipping threshold is met. */
  amount: number;
  freeShippingApplied: boolean;
  estimatedDaysMin: number | null;
  estimatedDaysMax: number | null;
}

/**
 * Shipping rate calculation.
 *
 * Strategy: `FLAT` uses basePrice; `WEIGHT_BASED` adds perKgPrice × kg.
 * A province-specific `ShippingMethodRate` row overrides the method defaults;
 * a row with `provinceId = NULL` is the countrywide fallback.
 *
 * Quoting is server-side only — the client picks a method by id and the price
 * is recomputed here, so a tampered payload cannot ship for free.
 */
@Injectable()
export class ShippingService {
  constructor(private readonly prisma: PrismaService) {}

  /** Methods offered at checkout, with the price each would cost this cart. */
  async optionsFor(input: { provinceName: string; orderSubtotal: number; weightGrams: number }) {
    const methods = await this.prisma.shippingMethod.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { basePrice: 'asc' }],
      include: { rates: { include: { province: true } } },
    });

    return methods.map((m) => this.price(m, input));
  }

  /** Authoritative quote for one method — used inside the checkout transaction. */
  async quote(
    client: Prisma.TransactionClient | PrismaService,
    input: { methodId: string; provinceName: string; orderSubtotal: number; weightGrams: number },
  ): Promise<ShippingQuote> {
    const method = await client.shippingMethod.findFirst({
      where: { id: input.methodId, isActive: true },
      include: { rates: { include: { province: true } } },
    });
    if (!method) {
      throw new AppError(ErrorCodes.NOT_FOUND, 404, 'Shipping method not found or unavailable');
    }
    return this.price(method, input);
  }

  async provinces() {
    return this.prisma.province.findMany({ orderBy: { name: 'asc' } });
  }

  private price(
    method: {
      id: string;
      name: string;
      carrier: string | null;
      strategy: string;
      basePrice: number;
      perKgPrice: number;
      freeShippingThreshold: number | null;
      estimatedDaysMin: number | null;
      estimatedDaysMax: number | null;
      rates: Array<{
        provinceId: number | null;
        province: { name: string } | null;
        basePrice: number | null;
        perKgPrice: number | null;
        freeShippingThreshold: number | null;
      }>;
    },
    input: { provinceName: string; orderSubtotal: number; weightGrams: number },
  ): ShippingQuote {
    // A province-specific override wins; otherwise the countrywide row.
    const provinceRate = method.rates.find((r) => r.province?.name === input.provinceName);
    const defaultRate = method.rates.find((r) => r.provinceId === null);
    const rate = provinceRate ?? defaultRate;

    const basePrice = rate?.basePrice ?? method.basePrice;
    const perKgPrice = rate?.perKgPrice ?? method.perKgPrice;
    const freeThreshold = rate?.freeShippingThreshold ?? method.freeShippingThreshold;

    let amount = basePrice;
    if (method.strategy === 'WEIGHT_BASED') {
      // Integer Toman: convert grams → kg with round-half-up, never float out.
      const kg = Math.floor(input.weightGrams / 1000 + 0.5);
      amount += perKgPrice * Math.max(0, kg);
    }

    const freeShippingApplied = freeThreshold !== null && input.orderSubtotal >= freeThreshold;
    if (freeShippingApplied) amount = 0;

    return {
      methodId: method.id,
      name: method.name,
      carrier: method.carrier,
      amount: Math.max(0, amount),
      freeShippingApplied,
      estimatedDaysMin: method.estimatedDaysMin,
      estimatedDaysMax: method.estimatedDaysMax,
    };
  }
}
