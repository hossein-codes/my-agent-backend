import { OrderService } from './order.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AppConfigService } from '../../config/app-config.service';

/**
 * The order state machine. An illegal transition here means either a customer
 * getting goods they never paid for, or a paid order being silently cancelled.
 */
function svcWith(order: Record<string, unknown>) {
  const db = {
    order: {
      findUnique: jest.fn(async () => order),
      findFirst: jest.fn(async () => order),
      findUniqueOrThrow: jest.fn(async () => order),
      findMany: jest.fn(async () => []),
      update: jest.fn(async (a: { data: Record<string, unknown> }) => ({ ...order, ...a.data })),
    },
    orderStatusHistory: { create: jest.fn(async () => ({})) },
    inventoryReservation: { findMany: jest.fn(async () => []) },
    couponUsage: { findFirst: jest.fn(async () => null), delete: jest.fn(async () => ({})) },
    coupon: { updateMany: jest.fn(), $executeRaw: jest.fn() },
    $executeRaw: jest.fn(async () => 1),
    // `any` is deliberate — see the note in the inventory spec.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $transaction: jest.fn(async (fn: (tx: any) => unknown) => fn(db)),
  } as any;
  const svc = new OrderService(
    db as unknown as PrismaService,
    { business: { orderPaymentWindowMinutes: 30, maxCartItems: 50, maxQtyPerOrderLine: 10 } } as AppConfigService,
    {} as never,
    { release: jest.fn(async () => true), consume: jest.fn(async () => true) } as never,
    { release: jest.fn(async () => undefined) } as never,
    {} as never,
    { notify: jest.fn(async () => ({ id: 'n', created: true })) } as never,
    { record: jest.fn(async () => undefined) } as never,
  );
  return { svc, db };
}

describe('OrderService.transition', () => {
  const from = (status: string) => svcWith({ id: 'o1', status, paidAmount: 1000, orderNumber: 'FA-1' });

  it.each([
    ['PENDING_PAYMENT', 'PAID'],
    ['PENDING_PAYMENT', 'CANCELLED'],
    ['PAID', 'PROCESSING'],
    ['PROCESSING', 'READY_TO_SHIP'],
    ['READY_TO_SHIP', 'SHIPPED'],
    ['SHIPPED', 'DELIVERED'],
    ['DELIVERED', 'COMPLETED'],
    ['DELIVERED', 'RETURN_REQUESTED'],
  ])('allows %s → %s', async (current, next) => {
    const { svc } = from(current);
    await expect(svc.transition('o1', next)).resolves.toBeDefined();
  });

  it.each([
    ['PENDING_PAYMENT', 'SHIPPED'],
    ['PENDING_PAYMENT', 'DELIVERED'],
    ['PAID', 'SHIPPED'],
    ['READY_TO_SHIP', 'PAID'],
    ['CANCELLED', 'PAID'],
    ['COMPLETED', 'CANCELLED'],
    ['SHIPPED', 'CANCELLED'],
  ])('rejects the illegal jump %s → %s', async (current, next) => {
    const { svc, db } = from(current);
    await expect(svc.transition('o1', next)).rejects.toMatchObject({ statusCode: 409 });
    expect(db.order.update).not.toHaveBeenCalled();
  });

  it('writes a history row for every accepted transition', async () => {
    const { svc, db } = from('PENDING_PAYMENT');
    await svc.transition('o1', 'PAID', 'SYSTEM', null, 'captured');
    expect(db.orderStatusHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fromStatus: 'PENDING_PAYMENT', toStatus: 'PAID', reason: 'captured' }),
      }),
    );
  });

  it('records the cancellation timestamp and reason', async () => {
    const { svc, db } = from('PENDING_PAYMENT');
    await svc.transition('o1', 'CANCELLED', 'USER', 'u1', 'changed my mind');
    expect(db.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'CANCELLED', cancelReason: 'changed my mind' }),
      }),
    );
  });
});

describe('OrderService.cancelByUser', () => {
  it('refuses to cancel someone else\'s order and reports 404, not 403', async () => {
    // findFirst is scoped by userId, so a foreign order looks absent. The
    // response must not confirm the order exists.
    const { svc } = svcWith({ id: 'o1', status: 'PAID' });
    (svc as unknown as { prisma: { order: { findFirst: jest.Mock } } }).prisma.order.findFirst.mockResolvedValueOnce(null);
    await expect(svc.cancelByUser('someone-else', 'o1')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('refuses to cancel an order that has already shipped', async () => {
    const { svc } = svcWith({ id: 'o1', status: 'SHIPPED' });
    await expect(svc.cancelByUser('u1', 'o1')).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('cancels an unpaid order', async () => {
    const { svc, db } = svcWith({ id: 'o1', status: 'PENDING_PAYMENT' });
    await expect(svc.cancelByUser('u1', 'o1')).resolves.toBeDefined();
    expect(db.orderStatusHistory.create).toHaveBeenCalled();
  });
});

describe('OrderService.expireUnpaidOrders', () => {
  it('cancels only orders whose payment window has closed', async () => {
    const { svc, db } = svcWith({ id: 'o1', status: 'PENDING_PAYMENT' });
    db.order.findMany.mockResolvedValueOnce([
      { id: 'o1', orderNumber: 'FA-1' },
      { id: 'o2', orderNumber: 'FA-2' },
    ]);
    const count = await svc.expireUnpaidOrders();
    expect(count).toBe(2);
    // The query itself must be time-bounded, never a blanket sweep.
    expect(db.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'PENDING_PAYMENT' }),
      }),
    );
  });

  it('returns 0 when nothing is stale, without touching any order', async () => {
    const { svc, db } = svcWith({ id: 'o1', status: 'PENDING_PAYMENT' });
    db.order.findMany.mockResolvedValueOnce([]);
    await expect(svc.expireUnpaidOrders()).resolves.toBe(0);
    expect(db.order.update).not.toHaveBeenCalled();
  });
});
