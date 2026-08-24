import { ShippingService } from './shipping.service';
import { PrismaService } from '../../shared/prisma/prisma.service';

/**
 * ShippingService rate rules against a fake reader.
 *
 * These are the rules that decide what a customer is charged for delivery, so
 * they are worth pinning down: strategy maths, free-shipping threshold, and
 * the province-override precedence.
 */
function svcWith(method: Record<string, unknown>) {
  const db = {
    shippingMethod: {
      findFirst: jest.fn(async () => method ?? null),
      findMany: jest.fn(async () => [method]),
    },
  } as unknown as PrismaService;
  return { svc: new ShippingService(db), db };
}

/** quote() reads through the client it is handed, so the fake must be passed in. */
function getQuote(svc: ShippingService, db: PrismaService, input: {
  methodId: string; provinceName: string; orderSubtotal: number; weightGrams: number;
}) {
  return svc.quote(db as never, input);
}

const base = {
  id: 'm1',
  name: 'Post',
  carrier: 'Post',
  basePrice: 45_000,
  perKgPrice: 20_000,
  freeShippingThreshold: 2_000_000,
  estimatedDaysMin: 2,
  estimatedDaysMax: 5,
  strategy: 'FLAT',
  rates: [],
};

describe('ShippingService', () => {
  it('charges basePrice for a FLAT method', async () => {
    const { svc, db } = svcWith(base);
    const quote = await getQuote(svc, db, {
      methodId: 'm1',
      provinceName: 'Tehran',
      orderSubtotal: 100_000,
      weightGrams: 5_000,
    });
    expect(quote.amount).toBe(45_000);
    expect(quote.freeShippingApplied).toBe(false);
  });

  it('adds per-kg cost for a WEIGHT_BASED method, rounding grams up to whole kg', async () => {
    const { svc, db } = svcWith({ ...base, strategy: 'WEIGHT_BASED' });
    // 1_500g → 2kg → 45_000 + 2×20_000
    const quote = await getQuote(svc, db, {
      methodId: 'm1',
      provinceName: 'Tehran',
      orderSubtotal: 100_000,
      weightGrams: 1_500,
    });
    expect(quote.amount).toBe(85_000);
  });

  it('never returns a negative amount for a zero-weight order', async () => {
    const { svc, db } = svcWith({ ...base, basePrice: 0, strategy: 'WEIGHT_BASED' });
    const quote = await getQuote(svc, db, {
      methodId: 'm1',
      provinceName: 'Tehran',
      orderSubtotal: 0,
      weightGrams: 0,
    });
    expect(quote.amount).toBe(0);
  });

  it('waives shipping at exactly the free-shipping threshold', async () => {
    const { svc, db } = svcWith(base);
    const at = await getQuote(svc, db, {
      methodId: 'm1',
      provinceName: 'Tehran',
      orderSubtotal: 2_000_000,
      weightGrams: 1_000,
    });
    const below = await getQuote(svc, db, {
      methodId: 'm1',
      provinceName: 'Tehran',
      orderSubtotal: 1_999_999,
      weightGrams: 1_000,
    });
    expect(at).toMatchObject({ amount: 0, freeShippingApplied: true });
    expect(below).toMatchObject({ amount: 45_000, freeShippingApplied: false });
  });

  it('prefers a province-specific rate over the countrywide default', async () => {
    const { svc, db } = svcWith({
      ...base,
      rates: [
        { provinceId: null, province: null, basePrice: 40_000, perKgPrice: null, freeShippingThreshold: null },
        { provinceId: 7, province: { name: 'Kish' }, basePrice: 120_000, perKgPrice: null, freeShippingThreshold: null },
      ],
    });
    const kish = await getQuote(svc, db, {
      methodId: 'm1',
      provinceName: 'Kish',
      orderSubtotal: 100_000,
      weightGrams: 1_000,
    });
    const other = await getQuote(svc, db, {
      methodId: 'm1',
      provinceName: 'Tehran',
      orderSubtotal: 100_000,
      weightGrams: 1_000,
    });
    expect(kish.amount).toBe(120_000);
    expect(other.amount).toBe(40_000);
  });

  it('falls back to the method defaults when no rate row matches', async () => {
    const { svc, db } = svcWith({
      ...base,
      rates: [{ provinceId: 7, province: { name: 'Kish' }, basePrice: 120_000, perKgPrice: null, freeShippingThreshold: null }],
    });
    const quote = await getQuote(svc, db, {
      methodId: 'm1',
      provinceName: 'Tehran',
      orderSubtotal: 100_000,
      weightGrams: 1_000,
    });
    expect(quote.amount).toBe(45_000);
  });

  it('rejects an unknown or inactive shipping method', async () => {
    const { svc, db } = svcWith(null as unknown as Record<string, unknown>);
    await expect(
      getQuote(svc, db, { methodId: 'nope', provinceName: 'Tehran', orderSubtotal: 0, weightGrams: 0 }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
