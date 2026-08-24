import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCodes } from '../../common/errors/error-codes';
import { InventoryService } from '../inventory/inventory.service';
import { NotificationService } from '../notifications/notification.service';
import { AuditService } from '../audit/audit.service';
import { PAYMENT_PROVIDER, type PaymentProvider } from '../providers/payment/payment-provider.port';

export interface CallbackInput {
  authority?: string;
  status?: string;
  externalId?: string;
  eventType?: string;
  payload?: unknown;
}

/**
 * Payment orchestration.
 *
 * The rules this class exists to enforce (spec §15):
 *
 *   1. The browser redirect NEVER marks anything paid. `handleCallback` only
 *      triggers a server-to-gateway verification.
 *   2. The amount charged is derived from the order, never from the client or
 *      the callback, and the gateway's confirmed amount must match exactly.
 *   3. Settlement is idempotent. A repeated callback or a user mashing the
 *      "verify" button cannot double-charge or double-fulfil.
 *   4. A gateway we cannot reach yields UNKNOWN, which leaves the order open
 *      for reconciliation rather than guessing.
 */
@Injectable()
export class PaymentService {
  private readonly logger = new Logger('Payments');

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly inventory: InventoryService,
    private readonly notifications: NotificationService,
    private readonly audit: AuditService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  /**
   * Starts (or resumes) payment for an order the caller owns.
   * An existing OPEN payment is reused so retries do not pile up attempts.
   */
  async initiate(userId: string, orderId: string, idempotencyKey?: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: { payments: { where: { status: { in: ['PENDING', 'PROCESSING', 'UNKNOWN'] } }, orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!order) throw AppError.notFound('Order not found', ErrorCodes.ORDER_NOT_FOUND);

    if (order.status === 'PAID' || order.paidAmount > 0) {
      throw new AppError(ErrorCodes.ORDER_ALREADY_PAID, 409, 'This order has already been paid');
    }
    if (order.paymentExpiresAt && order.paymentExpiresAt <= new Date()) {
      throw new AppError(ErrorCodes.ORDER_PAYMENT_EXPIRED, 409, 'The payment window for this order has closed');
    }

    const amount = order.totalAmount - order.paidAmount;
    if (amount <= 0) throw AppError.unprocessable('Nothing left to pay on this order', ErrorCodes.ORDER_NOT_PAYABLE);

    // Reuse an OPEN payment intent for this order (the DB also enforces one).
    let payment = order.payments[0];
    if (!payment) {
      payment = await this.prisma.payment.create({
        data: {
          orderId: order.id,
          amount,
          status: 'PENDING',
          idempotencyKey: idempotencyKey ?? null,
          expiresAt: order.paymentExpiresAt,
        },
      });
    }

    const callbackUrl = `${this.config.publicBaseUrl}/${this.config.apiPrefix}/payments/callback`;
    const initiation = await this.provider.initiate({
      amount,
      orderNumber: order.orderNumber,
      callbackUrl,
      payerPhone: order.contactPhone,
      description: `سفارش ${order.orderNumber}`,
    });

    if (!initiation.ok || !initiation.authority) {
      await this.prisma.paymentAttempt.create({
        data: {
          paymentId: payment.id,
          provider: this.provider.name,
          amount,
          status: 'FAILED',
          failureReason: initiation.error ?? 'initiation_failed',
          completedAt: new Date(),
        },
      });
      throw new AppError(ErrorCodes.PAYMENT_PROVIDER_ERROR, 502, 'The payment gateway could not start this payment');
    }

    const attempt = await this.prisma.paymentAttempt.create({
      data: {
        paymentId: payment.id,
        provider: this.provider.name,
        amount,
        status: 'PENDING',
        providerAuthority: initiation.authority,
        gatewayUrl: initiation.gatewayUrl ?? null,
        expiresAt: order.paymentExpiresAt,
      },
    });

    await this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'PROCESSING' } });

    return {
      paymentId: payment.id,
      attemptId: attempt.id,
      authority: initiation.authority,
      amount,
      gatewayUrl: initiation.gatewayUrl ?? null,
      callbackUrl,
    };
  }

  /**
   * Entry point for the redirect callback and the webhook.
   * Records the raw event and then delegates to `verifyAndSettle`.
   */
  async handleCallback(input: CallbackInput): Promise<{ outcome: string }> {
    const authority = input.authority ?? input.externalId;
    if (!authority) {
      this.logger.warn('callback received without an authority — ignored');
      return { outcome: 'IGNORED' };
    }

    const attempt = await this.prisma.paymentAttempt.findFirst({
      where: { providerAuthority: authority },
      select: { id: true, amount: true },
    });
    if (!attempt) {
      this.logger.warn(`callback for unknown authority ${authority}`);
      return { outcome: 'UNKNOWN_AUTHORITY' };
    }

    // A user-cancelling redirect needs no gateway round-trip.
    const cancelledByUser = typeof input.status === 'string' && input.status.toLowerCase() !== 'ok';
    if (cancelledByUser && !input.eventType) {
      await this.prisma.paymentAttempt.updateMany({
        where: { id: attempt.id, status: { in: ['PENDING', 'PROCESSING'] } },
        data: { status: 'FAILED', failureReason: 'cancelled_at_gateway', completedAt: new Date() },
      });
      return { outcome: 'CANCELLED' };
    }

    const result = await this.verifyAndSettle(authority);
    return { outcome: result.settled ? 'OK' : result.alreadySettled ? 'ALREADY_SETTLED' : 'NOT_SETTLED' };
  }

  /**
   * Verifies with the gateway and, on success, settles the order.
   * Safe to call repeatedly.
   */
  async verifyAndSettle(authority: string): Promise<{ settled: boolean; alreadySettled: boolean; outcome: string }> {
    const attempt = await this.prisma.paymentAttempt.findFirst({
      where: { providerAuthority: authority },
      include: { payment: { include: { order: true } } },
    });
    if (!attempt) throw new AppError(ErrorCodes.NOT_FOUND, 404, 'Unknown authority');

    // Idempotency: a settled attempt never re-runs the settlement path.
    if (attempt.status === 'SUCCEEDED') return { settled: false, alreadySettled: true, outcome: 'OK' };

    const { payment, order } = { payment: attempt.payment, order: attempt.payment.order };

    const result = await this.provider.verify(authority, attempt.amount);

    // Append-only lifecycle event; the dedupeKey makes replays a no-op.
    await this.recordEvent(attempt.id, result.outcome, {
      refId: result.refId ?? null,
      error: result.error ?? null,
    });

    if (result.outcome === 'UNKNOWN') {
      await this.prisma.paymentAttempt.update({
        where: { id: attempt.id },
        data: { status: 'UNKNOWN', failureReason: result.error ?? 'unverifiable' },
      });
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'UNKNOWN' } });
      this.logger.warn(`attempt ${attempt.id} unverifiable — left for reconciliation`);
      return { settled: false, alreadySettled: false, outcome: 'UNKNOWN' };
    }

    if (result.outcome !== 'OK') {
      await this.prisma.paymentAttempt.update({
        where: { id: attempt.id },
        data: { status: 'FAILED', failureReason: result.error ?? result.outcome.toLowerCase(), completedAt: new Date() },
      });
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED', failureReason: result.error ?? 'gateway_declined', closedAt: new Date() },
      });
      return { settled: false, alreadySettled: false, outcome: result.outcome };
    }

    // --- amount guard --------------------------------------------------------
    // The gateway must confirm exactly what we asked for. A mismatch means
    // either tampering or a stale intent; either way we refuse to settle.
    if (typeof result.amount === 'number' && result.amount !== attempt.amount) {
      await this.prisma.paymentAttempt.update({
        where: { id: attempt.id },
        data: { status: 'FAILED', failureReason: 'amount_mismatch', completedAt: new Date() },
      });
      await this.audit.record(
        { actorType: 'SYSTEM' },
        {
          action: 'PAYMENT_AMOUNT_MISMATCH',
          entityType: 'PaymentAttempt',
          entityId: attempt.id,
          oldValues: { expected: attempt.amount },
          newValues: { reported: result.amount },
        },
      );
      throw new AppError(ErrorCodes.PAYMENT_AMOUNT_MISMATCH, 409, 'Gateway amount does not match the order total');
    }

    return this.settle(attempt.id, payment.id, order.id, result.refId ?? authority, result.cardMask ?? null);
  }

  /**
   * The only place an order becomes PAID. Runs in one transaction with the
   * inventory consumption, so stock and money can never disagree.
   */
  private async settle(
    attemptId: string,
    paymentId: string,
    orderId: string,
    refId: string,
    cardMask: string | null,
  ): Promise<{ settled: boolean; alreadySettled: boolean; outcome: string }> {
    const settled = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Conditional update: only a non-settled attempt can settle. Two
      // concurrent callbacks cannot both pass.
      const claimed = await tx.paymentAttempt.updateMany({
        where: { id: attemptId, status: { notIn: ['SUCCEEDED'] } },
        data: { status: 'SUCCEEDED', completedAt: new Date() },
      });
      if (claimed.count === 0) return false;

      const attempt = await tx.paymentAttempt.findUniqueOrThrow({ where: { id: attemptId } });
      const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });

      await tx.paymentTransaction.create({
        data: {
          paymentAttemptId: attemptId,
          type: 'CAPTURE',
          provider: attempt.provider,
          providerRefId: refId,
          amount: attempt.amount,
          cardMask,
          verifiedAt: new Date(),
        },
      });

      await tx.payment.update({ where: { id: paymentId }, data: { status: 'SUCCEEDED', paidAt: new Date() } });

      const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
      const newPaid = Math.min(order.totalAmount, order.paidAmount + attempt.amount);
      const fullyPaid = newPaid >= order.totalAmount;

      await tx.order.update({
        where: { id: orderId },
        data: {
          paidAmount: newPaid,
          paidAt: fullyPaid ? (order.paidAt ?? new Date()) : order.paidAt,
          status: fullyPaid ? 'PAID' : order.status,
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: order.status,
          toStatus: fullyPaid ? 'PAID' : order.status,
          reason: `payment captured (${attempt.provider} ${refId})`,
        },
      });

      // Convert stock holds into sales.
      const reservations = await tx.inventoryReservation.findMany({
        where: { orderId, status: 'ACTIVE' },
        select: { id: true },
      });
      for (const r of reservations) {
        await this.inventory.consume(r.id, tx);
      }

      return true;
    });

    if (!settled) return { settled: false, alreadySettled: true, outcome: 'OK' };

    const order = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    await this.notifications.notify({
      userId: order.userId,
      type: 'PAYMENT_CONFIRMED',
      title: 'پرداخت با موفقیت انجام شد',
      body: `سفارش ${order.orderNumber} با موفقیت پرداخت شد.`,
      dedupeKey: `payment:${orderId}:PAID`,
      data: { orderNumber: order.orderNumber, amount: order.paidAmount },
      channels: ['IN_APP', 'SMS'],
    });

    await this.audit.record(
      { actorType: 'SYSTEM' },
      {
        action: 'PAYMENT_CAPTURED',
        entityType: 'Order',
        entityId: orderId,
        newValues: { paidAmount: order.paidAmount, status: order.status, refId },
      },
    );

    return { settled: true, alreadySettled: false, outcome: 'OK' };
  }

  private async recordEvent(
    paymentAttemptId: string,
    outcome: string,
    detail: Record<string, unknown>,
  ): Promise<void> {
    const attempt = await this.prisma.paymentAttempt.findUnique({
      where: { id: paymentAttemptId },
      select: { provider: true, providerAuthority: true },
    });
    const dedupeKey = `${attempt?.provider}:${attempt?.providerAuthority}:${outcome}`;
    try {
      await this.prisma.paymentEvent.create({
        data: {
          paymentAttemptId,
          type: outcome === 'OK' ? 'VERIFIED_OK' : outcome === 'CANCELLED' ? 'CANCELLED' : outcome === 'UNKNOWN' ? 'VERIFICATION_UNKNOWN' : 'VERIFIED_FAILED',
          dedupeKey,
          payload: detail as never,
        },
      });
    } catch (err) {
      // A duplicate dedupeKey means we already recorded this exact event.
      if ((err as { code?: string }).code !== 'P2002') {
        this.logger.warn(`could not record payment event: ${(err as Error).message}`);
      }
    }
  }
}
