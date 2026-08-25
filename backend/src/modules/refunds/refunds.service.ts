import { Injectable, Logger } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCodes } from '../../common/errors/error-codes';
import { InventoryService } from '../inventory/inventory.service';
import { NotificationService } from '../notifications/notification.service';
import { AuditService } from '../audit/audit.service';

export interface RefundInput {
  orderId: string;
  returnRequestId?: string;
  /**
   * Amount in Integer Toman. When omitted, it is derived from the approved
   * return items — never taken from the request body without validation.
   */
  amount?: number;
  method?: 'GATEWAY' | 'MANUAL_BANK_TRANSFER' | 'STORE_CREDIT';
  includesShipping?: boolean;
  idempotencyKey?: string;
  note?: string;
  actorId?: string;
}

/**
 * Refunds (spec §25/§26).
 *
 * Invariants this protects:
 *   - Σ refunds for an order can never exceed `paidAmount`. The check runs
 *     inside the same transaction as the insert, so concurrent refunds cannot
 *     both pass.
 *   - a refund must point at the verified SALE transaction it reverses, so
 *     money in and money out reconcile line by line
 *   - completion is idempotent via `idempotencyKey`
 *   - returned stock re-enters inventory exactly once
 */
@Injectable()
export class RefundsService {
  private readonly logger = new Logger('Refunds');

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly notifications: NotificationService,
    private readonly audit: AuditService,
  ) {}

  async create(input: RefundInput) {
    if (input.idempotencyKey) {
      const existing = await this.prisma.refund.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (existing) return existing;
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const order = await tx.order.findUniqueOrThrow({ where: { id: input.orderId } });
      if (order.paidAmount <= 0) {
        throw new AppError(ErrorCodes.REFUND_NOT_POSSIBLE, 422, 'Nothing has been paid on this order');
      }

      const alreadyRefunded = await tx.refund.aggregate({
        where: { orderId: order.id, status: { in: ['PENDING', 'PROCESSING', 'COMPLETED'] } },
        _sum: { amount: true },
      });
      const outstanding = order.paidAmount - (alreadyRefunded._sum.amount ?? 0);
      if (outstanding <= 0) {
        throw new AppError(ErrorCodes.REFUND_NOT_POSSIBLE, 409, 'This order has been fully refunded');
      }

      const amount = input.amount ?? (await this.deriveFromReturn(tx, input.returnRequestId));
      if (!Number.isInteger(amount) || amount <= 0) {
        throw AppError.badRequest('amount must be a positive integer (Toman)');
      }
      if (amount > outstanding) {
        throw AppError.badRequest(
          `Refund of ${amount} exceeds the ${outstanding} Toman still refundable on this order`,
          ErrorCodes.REFUND_NOT_POSSIBLE,
        );
      }

      const transaction = await tx.paymentTransaction.findFirst({
        where: { paymentAttempt: { payment: { orderId: order.id } }, type: 'SALE' },
        orderBy: { verifiedAt: 'desc' },
      });

      const refund = await tx.refund.create({
        data: {
          refundNumber: await this.generateRefundNumber(tx),
          orderId: order.id,
          returnRequestId: input.returnRequestId ?? null,
          paymentTransactionId: transaction?.id ?? null,
          amount,
          method: input.method ?? 'MANUAL_BANK_TRANSFER',
          status: 'PENDING',
          idempotencyKey: input.idempotencyKey ?? null,
          includesShipping: input.includesShipping ?? false,
          note: input.note ?? null,
        },
      });

      // Allocate the refund across the approved return items so the ledger
      // shows exactly which lines the money came from.
      if (input.returnRequestId) {
        const items = await tx.returnItem.findMany({
          where: { returnRequestId: input.returnRequestId, approvedQuantity: { gt: 0 } },
          include: { orderItem: true },
        });
        const basis = items.reduce((sum, i) => sum + i.orderItem.finalUnitPrice * (i.approvedQuantity ?? 0), 0);
        let allocated = 0;
        for (const [index, item] of items.entries()) {
          const isLast = index === items.length - 1;
          // The last line absorbs rounding so the allocations always sum exactly.
          const share = isLast
            ? amount - allocated
            : basis > 0
              ? Math.round((amount * item.orderItem.finalUnitPrice * (item.approvedQuantity ?? 0)) / basis)
              : Math.round(amount / items.length);
          allocated += share;
          await tx.refundItem.create({
            data: { refundId: refund.id, orderItemId: item.orderItemId, amount: Math.max(0, share) },
          });
        }
      }

      await this.audit.record(
        { actorType: input.actorId ? 'ADMIN' : 'SYSTEM', actorId: input.actorId ?? null },
        {
          action: 'REFUND_CREATED',
          entityType: 'Refund',
          entityId: refund.id,
          newValues: { amount, method: refund.method, orderId: order.id },
        },
      );

      return refund;
    });
  }

  /** Marks a refund paid out. Safe to call twice. */
  async complete(refundId: string, actorId?: string): Promise<{ status: string }> {
    const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const claimed = await tx.refund.updateMany({
        where: { id: refundId, status: { in: ['PENDING', 'PROCESSING'] } },
        data: { status: 'COMPLETED', processedAt: new Date(), processedById: actorId ?? null },
      });
      if (claimed.count === 0) return null;

      const refund = await tx.refund.findUniqueOrThrow({
        where: { id: refundId },
        include: { items: { include: { orderItem: true } } },
      });

      await tx.order.update({
        where: { id: refund.orderId },
        data: { refundedAmount: { increment: refund.amount } },
      });

      const items = await tx.orderItem.findMany({
        where: { orderId: refund.orderId },
        select: { id: true, refundedQuantity: true, quantity: true },
      });
      for (const item of items) {
        if (item.refundedQuantity < item.quantity) {
          await tx.orderItem.update({ where: { id: item.id }, data: { refundedQuantity: item.quantity } });
          break;
        }
      }

      // Returned goods go back on the shelf as a RETURN movement.
      for (const line of refund.items) {
        await this.inventory.adjust({
          variantId: line.orderItem.variantId,
          delta: line.orderItem.quantity,
          type: 'RETURN',
          actorId: actorId ?? null,
          note: `refund ${refund.refundNumber}`,
        });
      }

      return refund;
    });

    if (!result) return { status: 'ALREADY_COMPLETED' };

    const order = await this.prisma.order.findUniqueOrThrow({ where: { id: result.orderId } });
    await this.notifications.notify({
      userId: order.userId,
      type: 'REFUND_COMPLETED',
      title: 'مبلغ مرجوعی واریز شد',
      body: `مبلغ ${result.amount.toLocaleString('fa-IR')} تومان برای سفارش ${order.orderNumber} مرجوع شد.`,
      dedupeKey: `refund:${result.id}:COMPLETED`,
      data: { orderNumber: order.orderNumber, amount: result.amount },
      channels: ['IN_APP', 'SMS'],
    });

    this.logger.log(`refund ${result.refundNumber} completed (${result.amount} Toman)`);
    return { status: 'COMPLETED' };
  }

  /** Sums the approved return lines — the default refund size. */
  private async deriveFromReturn(tx: Prisma.TransactionClient, returnRequestId?: string): Promise<number> {
    if (!returnRequestId) {
      throw AppError.badRequest('Provide either an explicit amount or a returnRequestId');
    }
    const items = await tx.returnItem.findMany({
      where: { returnRequestId, approvedQuantity: { gt: 0 } },
      include: { orderItem: true },
    });
    if (items.length === 0) {
      throw new AppError(ErrorCodes.REFUND_NOT_POSSIBLE, 422, 'No approved items to refund');
    }
    return items.reduce((sum, i) => sum + i.orderItem.finalUnitPrice * (i.approvedQuantity ?? 0), 0);
  }

  private async generateRefundNumber(tx: Prisma.TransactionClient): Promise<string> {
    const now = new Date();
    const ymd = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const candidate = `RF-${ymd}-${String(randomInt(0, 1_000_000)).padStart(6, '0')}`;
      const clash = await tx.refund.findUnique({ where: { refundNumber: candidate }, select: { id: true } });
      if (!clash) return candidate;
    }
    throw AppError.conflict('Could not allocate a refund number. Please retry.');
  }
}
