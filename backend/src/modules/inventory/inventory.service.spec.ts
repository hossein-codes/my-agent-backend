import { InventoryService } from './inventory.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AppConfigService } from '../../config/app-config.service';

/**
 * Stock invariants. The one that must never break: two shoppers cannot both
 * take the final unit. That is enforced by a CONDITIONAL UPDATE, so these
 * tests assert on how many rows the update claimed, not on application logic.
 */
function svcWith(opts: { claimed?: number; inventory?: Record<string, unknown>; reservations?: unknown[] } = {}) {
  const inventoryRow = opts.inventory ?? { variantId: 'v1', onHand: 5, reserved: 0, lowStockThreshold: 3 };
  const db = {
    inventory: {
      findUnique: jest.fn(async () => inventoryRow),
      findUniqueOrThrow: jest.fn(async () => inventoryRow),
      findMany: jest.fn(async () => [inventoryRow]),
      create: jest.fn(async () => inventoryRow),
    },
    inventoryReservation: {
      create: jest.fn(async (a: { data: Record<string, unknown> }) => ({ id: 'res-1', ...a.data })),
      findUnique: jest.fn(async () => ({ id: 'res-1', variantId: 'v1', quantity: 2, status: 'ACTIVE' })),
      findMany: jest.fn(async () => opts.reservations ?? []),
      update: jest.fn(async () => ({})),
    },
    inventoryMovement: { create: jest.fn(async () => ({})) },
    $executeRaw: jest.fn(async () => opts.claimed ?? 1),
    // `any` is deliberate: this is a test double standing in for PrismaClient,
    // and typing all 74 model delegates would obscure the assertions.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $transaction: jest.fn(async (fn: (tx: any) => unknown) => fn(db)),
  } as any;
  const svc = new InventoryService(
    db as unknown as PrismaService,
    { business: { orderPaymentWindowMinutes: 30 } } as AppConfigService,
  );
  return { svc, db };
}

describe('InventoryService.reserve', () => {
  it('holds stock and writes a ledger row', async () => {
    const { svc, db } = svcWith();
    const result = await svc.reserve({ variantId: 'v1', quantity: 2 });
    expect(result.reservationId).toBe('res-1');
    expect(db.inventoryReservation.create).toHaveBeenCalled();
    expect(db.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'RESERVATION', quantity: 0 }) }),
    );
  });

  it('throws INSUFFICIENT_STOCK when the conditional update claims no row', async () => {
    // claimed === 0 means `onHand - reserved >= quantity` was false, i.e. the
    // unit was already taken by a concurrent shopper.
    const { svc, db } = svcWith({ claimed: 0 });
    await expect(svc.reserve({ variantId: 'v1', quantity: 2 })).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(db.inventoryReservation.create).not.toHaveBeenCalled();
    expect(db.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it('rejects a zero or fractional quantity before touching the database', async () => {
    const { svc, db } = svcWith();
    await expect(svc.reserve({ variantId: 'v1', quantity: 0 })).rejects.toBeDefined();
    await expect(svc.reserve({ variantId: 'v1', quantity: 1.5 })).rejects.toBeDefined();
    expect(db.$executeRaw).not.toHaveBeenCalled();
  });

  it('sets the hold to expire with the payment window', async () => {
    const { svc, db } = svcWith();
    const before = Date.now();
    await svc.reserve({ variantId: 'v1', quantity: 1, windowMinutes: 30 });
    const created = (db.inventoryReservation.create as jest.Mock).mock.calls[0][0].data;
    const expiry = new Date(created.expiresAt).getTime();
    expect(expiry).toBeGreaterThanOrEqual(before + 29 * 60_000);
    expect(expiry).toBeLessThanOrEqual(before + 31 * 60_000);
  });
});

describe('InventoryService.release', () => {
  it('is idempotent — releasing twice only frees the stock once', async () => {
    const { svc, db } = svcWith();
    (db.inventoryReservation.findUnique as jest.Mock).mockResolvedValue({
      id: 'res-1',
      variantId: 'v1',
      quantity: 2,
      status: 'RELEASED',
    });
    await expect(svc.release('res-1', 'EXPIRED')).resolves.toBe(false);
    expect(db.$executeRaw).not.toHaveBeenCalled();
  });

  it('frees the hold and writes a RESERVATION_RELEASE ledger row', async () => {
    const { svc, db } = svcWith();
    await expect(svc.release('res-1', 'CANCELLED')).resolves.toBe(true);
    expect(db.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'RESERVATION_RELEASE' }) }),
    );
  });

  it('returns false for an unknown reservation instead of throwing', async () => {
    const { svc, db } = svcWith();
    (db.inventoryReservation.findUnique as jest.Mock).mockResolvedValueOnce(null);
    await expect(svc.release('nope', 'EXPIRED')).resolves.toBe(false);
  });
});

describe('InventoryService.consume', () => {
  it('drops both onHand and reserved when a hold converts to a sale', async () => {
    const { svc, db } = svcWith();
    await expect(svc.consume('res-1')).resolves.toBe(true);
    expect(db.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'SALE', quantity: -2 }) }),
    );
  });

  it('does nothing for an already-consumed reservation', async () => {
    const { svc, db } = svcWith();
    (db.inventoryReservation.findUnique as jest.Mock).mockResolvedValue({
      id: 'res-1',
      variantId: 'v1',
      quantity: 2,
      status: 'CONSUMED',
    });
    await expect(svc.consume('res-1')).resolves.toBe(false);
    expect(db.inventoryMovement.create).not.toHaveBeenCalled();
  });
});

describe('InventoryService.adjust', () => {
  it('refuses to reduce stock below what is already reserved', async () => {
    const { svc, db } = svcWith({ claimed: 0, inventory: { variantId: 'v1', onHand: 5, reserved: 5, lowStockThreshold: 3 } });
    await expect(
      svc.adjust({ variantId: 'v1', delta: -3, type: 'DAMAGE' }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(db.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it('rejects a zero delta', async () => {
    const { svc } = svcWith();
    await expect(svc.adjust({ variantId: 'v1', delta: 0, type: 'ADJUSTMENT' })).rejects.toBeDefined();
  });

  it('accepts a restock and records who did it', async () => {
    const { svc, db } = svcWith();
    await svc.adjust({ variantId: 'v1', delta: 50, type: 'RECEIPT', actorId: 'admin-1' });
    expect(db.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'RESTOCK', quantity: 50, actorId: 'admin-1', source: 'ADMIN' }),
      }),
    );
  });
});

describe('InventoryService.availability', () => {
  it('never reports a negative available count', async () => {
    const { svc } = svcWith({ inventory: { variantId: 'v1', onHand: 3, reserved: 5, lowStockThreshold: 3 } });
    const a = await svc.availability('v1');
    expect(a.available).toBe(0);
  });

  it('flags low stock at the threshold', async () => {
    const { svc } = svcWith({ inventory: { variantId: 'v1', onHand: 5, reserved: 2, lowStockThreshold: 3 } });
    const a = await svc.availability('v1');
    expect(a).toMatchObject({ available: 3, lowStock: true });
  });

  it('treats a variant with no inventory row as unavailable', async () => {
    const { svc, db } = svcWith();
    (db.inventory.findUnique as jest.Mock).mockResolvedValueOnce(null);
    await expect(svc.availability('v1')).resolves.toMatchObject({ available: 0, lowStock: true });
  });

  it('batches lookups without an N+1', async () => {
    const { svc, db } = svcWith();
    await svc.availabilityFor(['v1', 'v2']);
    expect(db.inventory.findMany).toHaveBeenCalledTimes(1);
  });
});
