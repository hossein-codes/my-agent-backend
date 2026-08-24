import { PricingService } from './pricing.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCodes } from '../../common/errors/error-codes';

/**
 * PricingService's decision logic, exercised against a fake reader.
 *
 * The point of these tests is the MONEY RULES, not Prisma:
 *   - amounts stay Integer Toman (no float ever escapes)
 *   - rounding is round-half-up
 *   - a salePrice equal to basePrice is NOT a sale (no fake 0% badge)
 *   - a missing current price is a hard error on the charging path and a
 *     silent null on the display path
 */
function fakeReader(rows: Array<{ variantId: string; basePrice: number; salePrice: number | null }>) {
  return {
    variantPrice: {
      findFirst: jest.fn(async ({ where }: { where: { variantId: string } }) =>
        rows.find((r) => r.variantId === where.variantId) ?? null,
      ),
      findMany: jest.fn(async ({ where }: { where: { variantId: { in: string[] } } }) =>
        rows.filter((r) => where.variantId.in.includes(r.variantId)),
      ),
    },
    // currentPriceOrNull only reads variantPrice; the stub keeps the shape honest.
    productVariant: { findFirst: jest.fn() },
  } as unknown as PrismaService;
}

describe('PricingService', () => {
  const svc = new PricingService({} as PrismaService);

  it('uses basePrice when there is no sale price', async () => {
    const price = await svc.currentPriceOrNull(fakeReader([{ variantId: 'v1', basePrice: 450_000, salePrice: null }]), 'v1');
    expect(price).toMatchObject({ unitPrice: 450_000, salePrice: null, onSale: false, discountPercent: 0 });
  });

  it('uses salePrice and computes an integer percentage', async () => {
    const price = await svc.currentPriceOrNull(
      fakeReader([{ variantId: 'v1', basePrice: 400_000, salePrice: 300_000 }]),
      'v1',
    );
    expect(price).toMatchObject({ unitPrice: 300_000, salePrice: 300_000, onSale: true, discountPercent: 25 });
  });

  it('rounds the discount percentage half-up, never truncating', async () => {
    // 1/3 off = 33.333…% → must round to 33, and 2/3 → 66.666…% → 67.
    const a = await svc.currentPriceOrNull(fakeReader([{ variantId: 'v', basePrice: 300, salePrice: 200 }]), 'v');
    const b = await svc.currentPriceOrNull(fakeReader([{ variantId: 'v', basePrice: 300, salePrice: 100 }]), 'v');
    expect(a?.discountPercent).toBe(33);
    expect(b?.discountPercent).toBe(67);
  });

  it('treats salePrice === basePrice as NOT a sale', async () => {
    const price = await svc.currentPriceOrNull(
      fakeReader([{ variantId: 'v1', basePrice: 500_000, salePrice: 500_000 }]),
      'v1',
    );
    expect(price).toMatchObject({ onSale: false, salePrice: null, discountPercent: 0, unitPrice: 500_000 });
  });

  it('ignores a salePrice above basePrice instead of charging it', async () => {
    // A stale/mis-entered row must never INCREASE what the customer pays.
    const price = await svc.currentPriceOrNull(
      fakeReader([{ variantId: 'v1', basePrice: 100_000, salePrice: 150_000 }]),
      'v1',
    );
    expect(price?.unitPrice).toBe(100_000);
    expect(price?.onSale).toBe(false);
  });

  it('returns null (not a throw) when there is no current price', async () => {
    await expect(svc.currentPriceOrNull(fakeReader([]), 'missing')).resolves.toBeNull();
  });

  it('throws PRODUCT_NOT_AVAILABLE on the charging path when unpriced', async () => {
    await expect(svc.currentPrice(fakeReader([]), 'missing')).rejects.toMatchObject({
      code: ErrorCodes.PRODUCT_NOT_AVAILABLE,
      statusCode: 409,
    });
  });

  it('batches lookups in one query', async () => {
    const reader = fakeReader([
      { variantId: 'a', basePrice: 100, salePrice: null },
      { variantId: 'b', basePrice: 200, salePrice: 150 },
    ]);
    const map = await svc.currentPrices(reader, ['a', 'b', 'zz']);
    expect(reader.variantPrice.findMany).toHaveBeenCalledTimes(1);
    expect(map.get('a')?.unitPrice).toBe(100);
    expect(map.get('b')?.unitPrice).toBe(150);
    expect(map.has('zz')).toBe(false);
  });

  it('returns an empty map for an empty id list without querying', async () => {
    const reader = fakeReader([]);
    await expect(svc.currentPrices(reader, [])).resolves.toEqual(new Map());
    expect(reader.variantPrice.findMany).not.toHaveBeenCalled();
  });

  describe('setPrice validation', () => {
    it('rejects a fractional Toman amount', async () => {
      await expect(svc.setPrice({ variantId: 'v', basePrice: 100.5 })).rejects.toBeInstanceOf(AppError);
    });

    it('rejects a negative base price', async () => {
      await expect(svc.setPrice({ variantId: 'v', basePrice: -1 })).rejects.toBeInstanceOf(AppError);
    });

    it('rejects a sale price above the base price', async () => {
      await expect(svc.setPrice({ variantId: 'v', basePrice: 1000, salePrice: 2000 })).rejects.toBeInstanceOf(AppError);
    });

    it('accepts a zero sale price (a free item is representable)', async () => {
      // setPrice hits the DB after validating, so stub the transaction.
      const db = { $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn({ variantPrice: { updateMany: jest.fn(), create: jest.fn() } })) } as unknown as PrismaService;
      const result = await new PricingService(db).setPrice({ variantId: 'v', basePrice: 1000, salePrice: 0 });
      expect(result.unitPrice).toBe(0);
      expect(result.discountPercent).toBe(100);
    });
  });
});
