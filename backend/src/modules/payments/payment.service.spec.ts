import { PaymentService } from './payment.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AppConfigService } from '../../config/app-config.service';
import { InventoryService } from '../inventory/inventory.service';
import { NotificationService } from '../notifications/notification.service';
import { AuditService } from '../audit/audit.service';
import { ErrorCodes } from '../../common/errors/error-codes';
import type { PaymentProvider, VerifyResult } from '../providers/payment/payment-provider.port';

/**
 * The money path. These tests exist because a bug here is unrecoverable:
 *
 *   - a repeat callback must not fulfil an order twice
 *   - the browser redirect must never, on its own, mark anything paid
 *   - a gateway amount that differs from ours must refuse to settle
 *   - an unverifiable gateway must leave the order OPEN, not guess
 */
interface Db {
  paymentAttempt: {
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    findUniqueOrThrow: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    create: jest.Mock;
  };
  payment: { findUniqueOrThrow: jest.Mock; update: jest.Mock; create: jest.Mock };
  paymentTransaction: { create: jest.Mock };
  paymentEvent: { create: jest.Mock };
  order: { findUniqueOrThrow: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
  orderStatusHistory: { create: jest.Mock };
  inventoryReservation: { findMany: jest.Mock };
  $transaction: jest.Mock;
}

function makeDb(overrides: Partial<Record<keyof Db, unknown>> = {}): Db {
  const db: Db = {
    paymentAttempt: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(async (a: { data: unknown }) => a.data),
      updateMany: jest.fn(async () => ({ count: 1 })),
      create: jest.fn(async (a: { data: unknown }) => a.data),
    },
    payment: {
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(async (a: { data: unknown }) => a.data),
      create: jest.fn(async (a: { data: unknown }) => a.data),
    },
    paymentTransaction: { create: jest.fn(async () => ({})) },
    paymentEvent: { create: jest.fn(async () => ({})) },
    order: {
      findUniqueOrThrow: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(async (a: { data: unknown }) => a.data),
    },
    orderStatusHistory: { create: jest.fn(async () => ({})) },
    inventoryReservation: { findMany: jest.fn(async () => []) },
    $transaction: jest.fn(async (fn: (tx: Db) => unknown) => fn(db)),
    ...overrides,
  } as Db;
  return db;
}

const ORDER = {
  id: 'order-1',
  orderNumber: 'FA-260824-000001',
  userId: 'user-1',
  totalAmount: 500_000,
  paidAmount: 0,
  status: 'PENDING_PAYMENT',
  contactPhone: '+989121234567',
  paymentExpiresAt: new Date(Date.now() + 60_000),
};

function attempt(status = 'PENDING') {
  return {
    id: 'attempt-1',
    paymentId: 'pay-1',
    provider: 'mock',
    providerAuthority: 'auth-1',
    amount: 500_000,
    status,
    payment: { id: 'pay-1', orderId: ORDER.id, amount: 500_000, status: 'PROCESSING', order: ORDER },
  };
}

function service(db: Db, provider: Partial<PaymentProvider>, opts: { consume?: jest.Mock } = {}) {
  const notify = jest.fn(async () => ({ id: 'n', created: true }));
  const audit = jest.fn(async () => undefined);
  const consume = opts.consume ?? jest.fn(async () => true);

  const svc = new PaymentService(
    db as unknown as PrismaService,
    { publicBaseUrl: 'http://api.test', apiPrefix: 'api/v1', frontendBaseUrl: 'http://web.test' } as AppConfigService,
    { consume } as unknown as InventoryService,
    { notify } as unknown as NotificationService,
    { record: audit } as unknown as AuditService,
    { name: 'mock', initiate: jest.fn(), verify: jest.fn(), ...provider } as PaymentProvider,
  );
  return { svc, notify, audit, consume };
}

describe('PaymentService.verifyAndSettle', () => {
  it('settles an order and converts stock holds when the gateway confirms', async () => {
    const db = makeDb();
    db.paymentAttempt.findFirst.mockResolvedValueOnce(attempt()); // verifyAndSettle lookup
    db.paymentAttempt.findUnique.mockResolvedValueOnce({ provider: 'mock', providerAuthority: 'auth-1' });
    db.paymentAttempt.findUniqueOrThrow.mockResolvedValueOnce({ id: 'attempt-1', amount: 500_000, provider: 'mock' });
    db.payment.findUniqueOrThrow.mockResolvedValueOnce({ id: 'pay-1', orderId: ORDER.id, amount: 500_000 });
    db.order.findUniqueOrThrow
      .mockResolvedValueOnce({ ...ORDER }) // inside settle
      .mockResolvedValueOnce({ ...ORDER, paidAmount: 500_000, status: 'PAID' }); // post-tx read
    db.inventoryReservation.findMany.mockResolvedValueOnce([{ id: 'res-1' }]);

    const { svc, notify, consume } = service(db, {
      verify: jest.fn(async (): Promise<VerifyResult> => ({ outcome: 'OK', refId: 'ref-1', amount: 500_000 })),
    });

    const result = await svc.verifyAndSettle('auth-1');

    expect(result).toMatchObject({ settled: true, alreadySettled: false, outcome: 'OK' });
    expect(consume).toHaveBeenCalledWith('res-1', expect.anything());
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'PAYMENT_CONFIRMED', userId: 'user-1' }));
    expect(db.paymentTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ providerRefId: 'ref-1', amount: 500_000 }) }),
    );
  });

  it('is idempotent: an already-settled attempt is never settled again', async () => {
    const db = makeDb();
    db.paymentAttempt.findFirst.mockResolvedValueOnce(attempt('SUCCEEDED'));

    const { svc, notify, consume } = service(db, { verify: jest.fn() });
    const result = await svc.verifyAndSettle('auth-1');

    expect(result).toMatchObject({ settled: false, alreadySettled: true });
    expect(db.paymentAttempt.findFirst).toHaveBeenCalledTimes(1);
    // The gateway must not even be called again.
    expect(notify).not.toHaveBeenCalled();
    expect(consume).not.toHaveBeenCalled();
  });

  it('refuses to settle when the gateway confirms a different amount', async () => {
    const db = makeDb();
    db.paymentAttempt.findFirst.mockResolvedValueOnce(attempt());
    db.paymentAttempt.findUnique.mockResolvedValueOnce({ provider: 'mock', providerAuthority: 'auth-1' });

    const { svc, consume } = service(db, {
      verify: jest.fn(async (): Promise<VerifyResult> => ({ outcome: 'OK', refId: 'ref-1', amount: 1 })),
    });

    await expect(svc.verifyAndSettle('auth-1')).rejects.toMatchObject({ code: ErrorCodes.PAYMENT_AMOUNT_MISMATCH });
    expect(consume).not.toHaveBeenCalled();
    expect(db.paymentTransaction.create).not.toHaveBeenCalled();
  });

  it('leaves the order OPEN when the gateway cannot be verified', async () => {
    const db = makeDb();
    db.paymentAttempt.findFirst.mockResolvedValueOnce(attempt());
    db.paymentAttempt.findUnique.mockResolvedValueOnce({ provider: 'mock', providerAuthority: 'auth-1' });

    const { svc, consume } = service(db, {
      verify: jest.fn(async (): Promise<VerifyResult> => ({ outcome: 'UNKNOWN', error: 'timeout' })),
    });

    const result = await svc.verifyAndSettle('auth-1');

    // UNKNOWN must never be coerced into a failure or a success.
    expect(result).toMatchObject({ settled: false, alreadySettled: false, outcome: 'UNKNOWN' });
    expect(db.payment.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'UNKNOWN' }) }));
    expect(consume).not.toHaveBeenCalled();
  });

  it('throws 404 for an authority nobody issued', async () => {
    const db = makeDb();
    db.paymentAttempt.findFirst.mockResolvedValueOnce(null);
    const { svc } = service(db, { verify: jest.fn() });
    await expect(svc.verifyAndSettle('bogus')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('marks the attempt FAILED when the gateway declines', async () => {
    const db = makeDb();
    db.paymentAttempt.findFirst.mockResolvedValueOnce(attempt());
    db.paymentAttempt.findUnique.mockResolvedValueOnce({ provider: 'mock', providerAuthority: 'auth-1' });

    const { svc, consume } = service(db, {
      verify: jest.fn(async (): Promise<VerifyResult> => ({ outcome: 'FAILED', error: 'insufficient_funds' })),
    });
    const result = await svc.verifyAndSettle('auth-1');

    expect(result.outcome).toBe('FAILED');
    expect(db.paymentAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
    expect(consume).not.toHaveBeenCalled();
  });
});

describe('PaymentService.handleCallback — the redirect proves nothing', () => {
  it('does not settle on a bare redirect; it only triggers verification', async () => {
    const db = makeDb();
    // First lookup: handleCallback resolving the authority.
    db.paymentAttempt.findFirst
      .mockResolvedValueOnce({ id: 'attempt-1', amount: 500_000 })
      // Second lookup: verifyAndSettle re-reading with relations.
      .mockResolvedValueOnce(attempt('SUCCEEDED'));

    const { svc } = service(db, { verify: jest.fn() });
    const result = await svc.handleCallback({ authority: 'auth-1', status: 'OK' });

    // Already settled, so nothing happens — but critically the redirect alone
    // did not create a transaction.
    expect(db.paymentTransaction.create).not.toHaveBeenCalled();
    expect(result.outcome).toBe('ALREADY_SETTLED');
  });

  it('records a user cancellation without calling the gateway at all', async () => {
    const db = makeDb();
    db.paymentAttempt.findFirst.mockResolvedValueOnce({ id: 'attempt-1', amount: 500_000 });

    const verify = jest.fn();
    const { svc } = service(db, { verify });
    const result = await svc.handleCallback({ authority: 'auth-1', status: 'NOK' });

    expect(result.outcome).toBe('CANCELLED');
    expect(verify).not.toHaveBeenCalled();
    expect(db.paymentAttempt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
  });

  it('ignores a callback with no authority instead of guessing', async () => {
    const db = makeDb();
    const { svc } = service(db, { verify: jest.fn() });
    await expect(svc.handleCallback({})).resolves.toEqual({ outcome: 'IGNORED' });
  });
});
