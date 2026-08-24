import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomInt } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AppConfigService } from '../../config/app-config.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCodes } from '../../common/errors/error-codes';
import { PricingService } from '../pricing/pricing.service';
import { InventoryService } from '../inventory/inventory.service';
import { CouponService, type CartLine } from '../coupons/coupon.service';
import { ShippingService } from '../shipping/shipping.service';
import { NotificationService } from '../notifications/notification.service';
import { AuditService } from '../audit/audit.service';

export interface OrderAddressInput {
  receiverFirstName: string;
  receiverLastName: string;
  receiverPhone: string;
  provinceName: string;
  cityName: string;
  district?: string;
  postalCode: string;
  line: string;
  unit?: string;
  deliveryNotes?: string;
}

export interface CreateOrderInput {
  userId: string;
  address: OrderAddressInput;
  shippingMethodId: string;
  couponCode?: string;
  idempotencyKey?: string;
  requestHash: string;
}

/** Allowed forward transitions. Anything not listed is rejected. */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  PENDING_PAYMENT: ['PAID', 'CANCELLED'],
  PAID: ['PROCESSING', 'CANCELLED', 'RETURN_REQUESTED'],
  PROCESSING: ['READY_TO_SHIP', 'CANCELLED', 'RETURN_REQUESTED'],
  READY_TO_SHIP: ['SHIPPED'],
  SHIPPED: ['DELIVERED', 'RETURN_REQUESTED'],
  DELIVERED: ['COMPLETED', 'RETURN_REQUESTED'],
  RETURN_REQUESTED: ['PARTIALLY_RETURNED', 'RETURNED', 'PROCESSING'],
  PARTIALLY_RETURNED: ['RETURNED', 'COMPLETED'],
  RETURNED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

/**
 * Order lifecycle.
 *
 * Money rules (spec §4): every amount is Integer Toman and is SNAPSHOTTED onto
 * the order at creation. `Product.basePrice` and live `VariantPrice` rows are
 * never read again afterwards — renaming a product or changing a price must
 * not move money on an existing order.
 *
 * Stock is reserved at order creation for a payment window, and released by
 * the expiry job if the customer never pays.
 */
@Injectable()
export class OrderService {
  private readonly logger = new Logger('Orders');

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly pricing: PricingService,
    private readonly inventory: InventoryService,
    private readonly coupons: CouponService,
    private readonly shipping: ShippingService,
    private readonly notifications: NotificationService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Converts the active cart into an order inside ONE transaction.
   *
   * If it fails, nothing is persisted: no order, no reservation, no coupon
   * usage. The idempotency record is written in the same transaction, so a
   * retried request with the same key returns the original order.
   */
  async createFromCart(input: CreateOrderInput) {
    // --- idempotency gate (outside the tx: a fast path for exact replays) ----
    if (input.idempotencyKey) {
      const existing = await this.prisma.idempotencyRecord.findFirst({
        where: { scope: 'orders.create', key: input.idempotencyKey, userId: input.userId },
      });
      if (existing) {
        if (existing.requestHash !== input.requestHash) {
          throw new AppError(
            ErrorCodes.IDEMPOTENCY_CONFLICT,
            409,
            'This idempotency key was already used with a different request',
          );
        }
        const ref = (existing.responseBody as { orderId?: string } | null)?.orderId;
        if (ref) {
          const order = await this.prisma.order.findUnique({ where: { id: ref } });
          if (order) return this.toDetail(order, await this.loadRelations(order.id));
        }
      }
    }

    const order = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const cart = await tx.cart.findFirst({
        where: { userId: input.userId, status: 'ACTIVE' },
        include: {
          items: {
            include: {
              variant: {
                include: {
                  product: { select: { id: true, name: true, slug: true, status: true, deletedAt: true, publishedAt: true } },
                  color: { select: { displayName: true } },
                  size: { select: { label: true } },
                  prices: { where: { effectiveTo: null }, take: 1 },
                },
              },
            },
          },
        },
      });

      if (!cart || cart.items.length === 0) {
        throw new AppError(ErrorCodes.CART_EMPTY, 422, 'Your cart is empty');
      }
      if (cart.items.length > this.config.business.maxCartItems) {
        throw new AppError(ErrorCodes.CART_ITEM_LIMIT, 422, 'Cart has too many lines');
      }

      // --- price every line from the AUTHORITATIVE current price -------------
      let subtotal = 0;
      let productDiscount = 0;
      let totalWeight = 0;

      const lineData = cart.items.map((item) => {
        const variant = item.variant;
        const purchasable =
          variant.isActive &&
          variant.product.status === 'ACTIVE' &&
          variant.product.deletedAt === null &&
          variant.product.publishedAt !== null &&
          variant.product.publishedAt <= new Date();
        if (!purchasable) {
          throw new AppError(
            ErrorCodes.PRODUCT_NOT_AVAILABLE,
            409,
            `${variant.product.name} is no longer available`,
          );
        }

        const priceRow = variant.prices[0];
        if (!priceRow) {
          throw new AppError(ErrorCodes.PRODUCT_NOT_AVAILABLE, 409, `${variant.product.name} has no current price`);
        }

        const unitPrice = priceRow.basePrice;
        const finalUnitPrice = priceRow.salePrice !== null && priceRow.salePrice < priceRow.basePrice ? priceRow.salePrice : priceRow.basePrice;
        const discountPerUnit = unitPrice - finalUnitPrice;
        const lineTotal = finalUnitPrice * item.quantity;

        if (item.quantity > this.config.business.maxQtyPerOrderLine) {
          throw new AppError(ErrorCodes.CART_ITEM_LIMIT, 422, `Quantity for ${variant.product.name} exceeds the per-line limit`);
        }

        subtotal += lineTotal;
        productDiscount += discountPerUnit * item.quantity;
        totalWeight += (variant.weightGrams ?? 0) * item.quantity;

        return {
          productId: variant.productId,
          variantId: variant.id,
          variantPriceId: priceRow.id,
          productName: variant.product.name,
          variantSku: variant.sku,
          colorName: variant.color?.displayName ?? null,
          sizeLabel: variant.size?.label ?? null,
          weightGrams: variant.weightGrams,
          unitPrice,
          discountPerUnit,
          finalUnitPrice,
          quantity: item.quantity,
          lineTotal,
        };
      });

      // --- shipping, priced server-side -------------------------------------
      const shippingQuote = await this.shipping.quote(tx, {
        methodId: input.shippingMethodId,
        provinceName: input.address.provinceName,
        orderSubtotal: subtotal,
        weightGrams: totalWeight,
      });

      // --- coupon, validated against the real line set -----------------------
      let couponDiscount = 0;
      let couponId: string | null = null;
      let couponCodeSnapshot: string | null = null;

      if (input.couponCode) {
        const lines: CartLine[] = await Promise.all(
          lineData.map(async (l) => {
            const product = await tx.product.findUniqueOrThrow({
              where: { id: l.productId },
              include: {
                categories: { include: { category: { select: { path: true } } } },
                collections: { select: { collectionId: true } },
              },
            });
            return {
              productId: l.productId,
              categoryPathPrefixes: product.categories.map((c) => c.category.path),
              collectionIds: product.collections.map((c) => c.collectionId),
            };
          }),
        );

        const validation = await this.coupons.validateForCheckout(tx, {
          code: input.couponCode,
          userId: input.userId,
          subtotal,
          lines,
        });
        couponDiscount = validation.discount;
        couponId = validation.couponId;
        couponCodeSnapshot = validation.code;
      }

      const shippingAmount = shippingQuote.amount;
      const totalAmount = Math.max(0, subtotal - couponDiscount) + shippingAmount;
      if (totalAmount <= 0) {
        throw AppError.unprocessable('Computed order total must be positive', ErrorCodes.CHECKOUT_FAILED);
      }

      // --- create the order --------------------------------------------------
      const orderNumber = await this.generateOrderNumber(tx);
      const paymentExpiresAt = new Date(Date.now() + this.config.business.orderPaymentWindowMinutes * 60_000);

      const created = await tx.order.create({
        data: {
          orderNumber,
          userId: input.userId,
          status: 'PENDING_PAYMENT',
          totalAmount,
          couponId,
          couponCodeSnapshot,
          contactPhone: input.address.receiverPhone,
          paymentExpiresAt,
          items: { create: lineData },
          address: { create: { ...input.address } },
          financialSnapshot: {
            create: {
              subtotalAmount: subtotal,
              productDiscountAmount: productDiscount,
              couponDiscountAmount: couponDiscount,
              shippingAmount,
              totalAmount,
            },
          },
          statusHistory: {
            create: { fromStatus: null, toStatus: 'PENDING_PAYMENT', actorType: 'USER', actorId: input.userId, reason: 'order created' },
          },
        },
      });

      // --- reserve stock; a failure aborts the whole order -------------------
      for (const line of lineData) {
        await this.inventory.reserve({
          variantId: line.variantId,
          quantity: line.quantity,
          userId: input.userId,
          orderId: created.id,
          windowMinutes: this.config.business.orderPaymentWindowMinutes,
          tx,
        });
      }

      if (couponId && couponDiscount > 0) {
        await this.coupons.consume(tx, { couponId, userId: input.userId, orderId: created.id, discount: couponDiscount });
      }

      // Close the cart so it cannot be checked out twice.
      await tx.cart.update({ where: { id: cart.id }, data: { status: 'CONVERTED', convertedOrderId: created.id } });

      if (input.idempotencyKey) {
        await tx.idempotencyRecord.create({
          data: {
            scope: 'orders.create',
            key: input.idempotencyKey,
            userId: input.userId,
            requestHash: input.requestHash,
            responseStatus: 201,
            // The created order id lives in the JSON body — the schema has no
            // dedicated column, and expiresAt is mandatory.
            responseBody: { orderId: created.id } as Prisma.InputJsonValue,
            expiresAt: new Date(Date.now() + 24 * 3600_000),
          },
        });
      }

      return created;
    });

    await this.notifications.notify({
      userId: input.userId,
      type: 'ORDER_CREATED',
      title: 'سفارش ثبت شد',
      body: `سفارش ${order.orderNumber} ثبت شد. برای تکمیل خرید، پرداخت را انجام دهید.`,
      dedupeKey: `order:${order.id}:CREATED`,
      data: { orderNumber: order.orderNumber, totalAmount: order.totalAmount },
      channels: ['IN_APP'],
    });

    await this.audit.record(
      { actorType: 'USER', actorId: input.userId },
      {
        action: 'ORDER_CREATED',
        entityType: 'Order',
        entityId: order.id,
        newValues: { orderNumber: order.orderNumber, totalAmount: order.totalAmount },
      },
    );

    return this.toDetail(order, await this.loadRelations(order.id));
  }

  async listForUser(userId: string, page: number, pageSize: number, status?: string) {
    const where = { userId, ...(status ? { status: status as never } : {}) };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        orderBy: { placedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          items: { take: 4, select: { productName: true, quantity: true, finalUnitPrice: true } },
          _count: { select: { items: true } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      items: rows.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        totalAmount: o.totalAmount,
        paidAmount: o.paidAmount,
        placedAt: o.placedAt,
        itemCount: o._count.items,
        preview: o.items,
        paymentExpiresAt: o.paymentExpiresAt,
      })),
      total,
    };
  }

  /** Admin projection — no owner filter, but the order must exist. */
  async getForAdmin(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw AppError.notFound('Order not found', ErrorCodes.ORDER_NOT_FOUND);
    return this.toDetail(order, await this.loadRelations(orderId));
  }

  async getForUser(userId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, userId } });
    // Ownership is in the query, so a foreign order is indistinguishable from
    // a missing one — the endpoint never confirms an order exists.
    if (!order) throw AppError.notFound('Order not found', ErrorCodes.ORDER_NOT_FOUND);
    return this.toDetail(order, await this.loadRelations(orderId));
  }

  /** Customer-side cancellation. Only valid while nothing has shipped. */
  async cancelByUser(userId: string, orderId: string, reason?: string) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, userId } });
    if (!order) throw AppError.notFound('Order not found', ErrorCodes.ORDER_NOT_FOUND);
    if (!ALLOWED_TRANSITIONS[order.status]?.includes('CANCELLED')) {
      throw new AppError(ErrorCodes.ORDER_NOT_CANCELLABLE, 409, `An order in ${order.status} cannot be cancelled`);
    }
    return this.transition(order.id, 'CANCELLED', 'USER', userId, reason ?? 'cancelled by customer');
  }

  /** Admin transition, validated against the allowed graph. */
  async transition(
    orderId: string,
    toStatus: string,
    actorType: 'USER' | 'ADMIN' | 'SYSTEM' = 'SYSTEM',
    actorId?: string | null,
    reason?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
      if (!ALLOWED_TRANSITIONS[order.status]?.includes(toStatus)) {
        throw new AppError(
          ErrorCodes.CONFLICT,
          409,
          `Cannot move an order from ${order.status} to ${toStatus}`,
        );
      }

      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          status: toStatus as never,
          cancelledAt: toStatus === 'CANCELLED' ? new Date() : order.cancelledAt,
          cancelReason: toStatus === 'CANCELLED' ? (reason ?? null) : order.cancelReason,
          shippedAt: toStatus === 'SHIPPED' ? (order.shippedAt ?? new Date()) : order.shippedAt,
          deliveredAt: toStatus === 'DELIVERED' ? (order.deliveredAt ?? new Date()) : order.deliveredAt,
          completedAt: toStatus === 'COMPLETED' ? (order.completedAt ?? new Date()) : order.completedAt,
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: order.status as never,
          toStatus: toStatus as never,
          actorType: actorType as never,
          actorId: actorId ?? null,
          reason: reason ?? null,
        },
      });

      // Cancelling must give the stock and the coupon back.
      if (toStatus === 'CANCELLED') {
        const reservations = await tx.inventoryReservation.findMany({
          where: { orderId, status: 'ACTIVE' },
          select: { id: true },
        });
        for (const r of reservations) await this.inventory.release(r.id, 'CANCELLED', tx);
        await this.coupons.release(tx, orderId);
      }

      return updated;
    });
  }

  /** Releases stock for orders whose payment window closed. Run by the jobs module. */
  async expireUnpaidOrders(): Promise<number> {
    const stale = await this.prisma.order.findMany({
      where: {
        status: 'PENDING_PAYMENT',
        paymentExpiresAt: { not: null, lt: new Date() },
      },
      select: { id: true, orderNumber: true },
      take: 200,
    });

    let cancelled = 0;
    for (const o of stale) {
      try {
        await this.transition(o.id, 'CANCELLED', 'SYSTEM', null, 'payment window expired');
        cancelled += 1;
      } catch (err) {
        this.logger.warn(`could not expire order ${o.orderNumber}: ${(err as Error).message}`);
      }
    }
    if (cancelled > 0) this.logger.log(`cancelled ${cancelled} unpaid order(s)`);
    return cancelled;
  }

  /** Public, collision-safe: `FA-YYMMDD-XXXXXX`. */
  private async generateOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
    const now = new Date();
    const ymd = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const candidate = `FA-${ymd}-${String(randomInt(0, 1_000_000)).padStart(6, '0')}`;
      const clash = await tx.order.findUnique({ where: { orderNumber: candidate }, select: { id: true } });
      if (!clash) return candidate;
    }
    // Extremely unlikely; fall back to a hash-derived suffix.
    return `FA-${ymd}-${createHash('sha1').update(`${Date.now()}${randomInt(0, 1e9)}`).digest('hex').slice(0, 8).toUpperCase()}`;
  }

  private async loadRelations(orderId: string) {
    const [items, address, snapshot, history, shipments, payments] = await Promise.all([
      this.prisma.orderItem.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.orderAddress.findUnique({ where: { orderId } }),
      this.prisma.orderFinancialSnapshot.findUnique({ where: { orderId } }),
      this.prisma.orderStatusHistory.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.shipment.findMany({ where: { orderId }, include: { items: true } }),
      this.prisma.payment.findMany({ where: { orderId }, orderBy: { createdAt: 'desc' }, select: { id: true, status: true, amount: true, paidAt: true } }),
    ]);
    return { items, address, snapshot, history, shipments, payments };
  }

  private toDetail(order: { id: string; orderNumber: string; status: string; totalAmount: number; paidAmount: number; refundedAmount: number; couponCodeSnapshot: string | null; contactPhone: string; placedAt: Date; paymentExpiresAt: Date | null; paidAt: Date | null; shippedAt: Date | null; deliveredAt: Date | null; cancelledAt: Date | null; cancelReason: string | null; completedAt: Date | null }, rel: Awaited<ReturnType<OrderService['loadRelations']>>) {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      totals: {
        subtotal: rel.snapshot?.subtotalAmount ?? 0,
        productDiscount: rel.snapshot?.productDiscountAmount ?? 0,
        couponDiscount: rel.snapshot?.couponDiscountAmount ?? 0,
        shipping: rel.snapshot?.shippingAmount ?? 0,
        total: order.totalAmount,
        paid: order.paidAmount,
        refunded: order.refundedAmount,
        // Everything the frontend needs to render, in Integer Toman.
        currency: 'IRT',
      },
      couponCode: order.couponCodeSnapshot,
      contactPhone: order.contactPhone,
      items: rel.items.map((i) => ({
        id: i.id,
        productId: i.productId,
        variantId: i.variantId,
        name: i.productName,
        sku: i.variantSku,
        color: i.colorName,
        size: i.sizeLabel,
        unitPrice: i.unitPrice,
        discountPerUnit: i.discountPerUnit,
        finalUnitPrice: i.finalUnitPrice,
        quantity: i.quantity,
        lineTotal: i.lineTotal,
        shippedQuantity: i.shippedQuantity,
        returnedQuantity: i.returnedQuantity,
      })),
      address: rel.address,
      shipments: rel.shipments,
      payments: rel.payments,
      history: rel.history.map((h) => ({ from: h.fromStatus, to: h.toStatus, at: h.createdAt, reason: h.reason })),
      dates: {
        placedAt: order.placedAt,
        paymentExpiresAt: order.paymentExpiresAt,
        paidAt: order.paidAt,
        shippedAt: order.shippedAt,
        deliveredAt: order.deliveredAt,
        completedAt: order.completedAt,
        cancelledAt: order.cancelledAt,
        cancelReason: order.cancelReason,
      },
    };
  }
}
