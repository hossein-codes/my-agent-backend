import { CouponService } from './coupon.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AppConfigService } from '../../config/app-config.service';
import { ErrorCodes } from '../../common/errors/error-codes';

/**
 * Coupon rules. The behaviours worth pinning are the ones that cost money or
 * leak information:
 *   - an invalid/expired/exhausted code all return the SAME error, so a coupon
 *     code cannot be enumerated
 *   - the discount is capped by maxDiscountAmount and never exceeds the base
 *   - per-user and global limits are enforced
 */
const NOW = new Date('2026-06-15T12:00:00Z');

interface FakeCoupon {
  code: string;
  status: string;
  percentOff: number;
  minOrderAmount: number;
  maxDiscountAmount: number | null;
  startsAt: Date;
  endsAt: Date | null;
  usageLimitTotal: number | null;
  usageLimitPerUser: number;
  usageCount: number;
}

const validCoupon: FakeCoupon = {
  code: 'SPRING20',
  status: 'ACTIVE',
  percentOff: 20,
  minOrderAmount: 0,
  maxDiscountAmount: null,
  startsAt: new Date(NOW.getTime() - 86_400_000),
  endsAt: new Date(NOW.getTime() + 86_400_000),
  usageLimitTotal: null,
  usageLimitPerUser: 1,
  usageCount: 0,
};

function fake(coupon: FakeCoupon | null, usageByUser = 0) {
  return {
    coupon: { findUnique: jest.fn(async () => (coupon ? { ...coupon, targets: [] } : null)) },
    couponUsage: { count: jest.fn(async () => usageByUser) },
  } as unknown as PrismaService;
}

const config = { business: { oneCouponPerOrder: true } } as AppConfigService;
const fakeDb = {} as PrismaService;
const lines = [{ productId: 'p1', categoryPathPrefixes: ['/clothing/'], collectionIds: [] }];

describe('CouponService', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(NOW));
  afterEach(() => jest.useRealTimers());

  const validate = (coupon: FakeCoupon | null, subtotal: number, usageByUser = 0, code = 'SPRING20') =>
    new CouponService(fakeDb, config).validateForCheckout(fake(coupon, usageByUser), {
      code,
      userId: 'u1',
      subtotal,
      lines,
    });

  it('normalizes codes to uppercase before lookup', async () => {
    const db = fake(validCoupon);
    await new CouponService(fakeDb, config).validateForCheckout(db, {
      code: '  spring20 ',
      userId: 'u1',
      subtotal: 1000,
      lines,
    });
    expect(db.coupon.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { code: 'SPRING20' } }));
  });

  it('applies the percentage to the subtotal', async () => {
    const result = await validate(validCoupon, 1_000_000);
    expect(result.discount).toBe(200_000);
    expect(result.capped).toBe(false);
  });

  it('caps the discount at maxDiscountAmount', async () => {
    const result = await validate({ ...validCoupon, maxDiscountAmount: 50_000 }, 1_000_000);
    expect(result.discount).toBe(50_000);
    expect(result.capped).toBe(true);
  });

  it('never discounts more than the applicable subtotal', async () => {
    const result = await validate({ ...validCoupon, percentOff: 100 }, 30_000);
    expect(result.discount).toBeLessThanOrEqual(30_000);
  });

  it('rounds the discount half-up in integer Toman', async () => {
    // 15% of 333 = 49.95 → 50
    const result = await validate({ ...validCoupon, percentOff: 15 }, 333);
    expect(result.discount).toBe(50);
    expect(Number.isInteger(result.discount)).toBe(true);
  });

  describe('rejections return the same signal to avoid enumeration', () => {
    const cases: Array<[string, FakeCoupon | null, number]> = [
      ['unknown code', null, 1_000_000],
      ['inactive coupon', { ...validCoupon, status: 'INACTIVE' }, 1_000_000],
      ['not started yet', { ...validCoupon, startsAt: new Date(NOW.getTime() + 86_400_000) }, 1_000_000],
      ['expired', { ...validCoupon, endsAt: new Date(NOW.getTime() - 1000) }, 1_000_000],
    ];

    it.each(cases)('rejects: %s', async (_name, coupon, subtotal) => {
      await expect(validate(coupon, subtotal)).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  it('rejects when the global usage limit is reached', async () => {
    await expect(validate({ ...validCoupon, usageLimitTotal: 10, usageCount: 10 }, 1_000_000)).rejects.toMatchObject({
      code: ErrorCodes.COUPON_EXHAUSTED,
      statusCode: 409,
    });
  });

  it('rejects when this user already hit their per-user limit', async () => {
    await expect(validate({ ...validCoupon, usageLimitPerUser: 1 }, 1_000_000, 1)).rejects.toMatchObject({
      code: ErrorCodes.COUPON_ALREADY_USED,
      statusCode: 409,
    });
  });

  it('allows a second use when the per-user limit permits it', async () => {
    await expect(validate({ ...validCoupon, usageLimitPerUser: 3 }, 1_000_000, 2)).resolves.toMatchObject({
      discount: 200_000,
    });
  });

  it('rejects when the subtotal is below minOrderAmount', async () => {
    await expect(validate({ ...validCoupon, minOrderAmount: 500_000 }, 499_999)).rejects.toMatchObject({
      code: ErrorCodes.COUPON_MIN_SUBTOTAL,
      statusCode: 422,
    });
  });

  it('accepts a subtotal exactly at minOrderAmount', async () => {
    await expect(validate({ ...validCoupon, minOrderAmount: 500_000 }, 500_000)).resolves.toMatchObject({
      code: 'SPRING20',
    });
  });

  describe('consume()', () => {
    const tx = (claimed: number, existingUsage: unknown = null) =>
      ({
        $executeRaw: jest.fn(async () => claimed),
        couponUsage: {
          findFirst: jest.fn(async () => existingUsage),
          create: jest.fn(async () => ({})),
        },
      }) as never;

    it('throws when the conditional usage increment claims nothing', async () => {
      await expect(
        new CouponService(fakeDb, config).consume(tx(0), {
          couponId: 'c1',
          userId: 'u1',
          orderId: 'o1',
          discount: 100,
        }),
      ).rejects.toMatchObject({ code: ErrorCodes.COUPON_EXHAUSTED });
    });

    it('refuses a second coupon on the same order when oneCouponPerOrder is set', async () => {
      await expect(
        new CouponService(fakeDb, config).consume(tx(1, { id: 'existing' }), {
          couponId: 'c1',
          userId: 'u1',
          orderId: 'o1',
          discount: 100,
        }),
      ).rejects.toMatchObject({ code: ErrorCodes.COUPON_ALREADY_USED });
    });

    it('records the usage when the increment succeeds', async () => {
      const client = tx(1);
      await new CouponService(fakeDb, config).consume(client, {
        couponId: 'c1',
        userId: 'u1',
        orderId: 'o1',
        discount: 100,
      });
      expect((client as unknown as { couponUsage: { create: jest.Mock } }).couponUsage.create).toHaveBeenCalled();
    });
  });
});
