import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AppConfigService } from '../../config/app-config.service';
import { PricingService } from '../pricing/pricing.service';
import { CouponService } from '../coupons/coupon.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCodes } from '../../common/errors/error-codes';

/**
 * Cart: owner-scoped; NEVER stores money (live display-only prices);
 * adding items does NOT reserve stock (spec §10).
 */
@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly pricing: PricingService,
    private readonly coupons: CouponService,
  ) {}

  private async activeCart(userId: string, create = true) {
    const existing = await this.prisma.cart.findFirst({ where: { userId, status: 'ACTIVE' } });
    if (existing || !create) return existing;
    return this.prisma.cart.create({ data: { userId } });
  }

  async addItem(userId: string, variantId: string, quantity: number): Promise<void> {
    if (quantity < 1 || quantity > this.config.business.maxQtyPerOrderLine) {
      throw AppError.badRequest(`Quantity must be 1..${this.config.business.maxQtyPerOrderLine}`, 'common.validation_error');
    }
    await this.prisma.$transaction(async (tx) => {
      const cart = await tx.cart.findFirst({ where: { userId, status: 'ACTIVE' } })
        ?? await tx.cart.create({ data: { userId } });
      const variant = await tx.productVariant.findUnique({
        where: { id: variantId },
        include: { product: true, inventory: true },
      });
      if (!variant || !variant.isActive || variant.product.status !== 'ACTIVE' || variant.product.deletedAt !== null
          || variant.product.publishedAt === null || variant.product.publishedAt > new Date()) {
        throw new AppError(ErrorCodes.PRODUCT_NOT_AVAILABLE, 409, 'Variant is not purchasable');
      }
      const price = await this.pricing.currentPriceOrNull(tx, variantId);
      if (!price) throw new AppError(ErrorCodes.PRODUCT_NOT_AVAILABLE, 409, 'Variant has no current price');

      const existing = await tx.cartItem.findUnique({ where: { cartId_variantId: { cartId: cart.id, variantId } } });
      if (existing) {
        const newQty = existing.quantity + quantity;
        if (newQty > this.config.business.maxQtyPerOrderLine) {
          throw new AppError(ErrorCodes.CART_ITEM_LIMIT, 422, 'Quantity exceeds per-line maximum');
        }
        await tx.cartItem.update({ where: { id: existing.id }, data: { quantity: newQty } });
      } else {
        const count = await tx.cartItem.count({ where: { cartId: cart.id } });
        if (count >= this.config.business.maxCartItems) {
          throw new AppError(ErrorCodes.CART_ITEM_LIMIT, 422, 'Cart line limit reached');
        }
        await tx.cartItem.create({ data: { cartId: cart.id, variantId, quantity } });
      }
    });
  }

  async updateItem(userId: string, variantId: string, quantity: number): Promise<void> {
    if (quantity < 1 || quantity > this.config.business.maxQtyPerOrderLine) {
      throw AppError.badRequest(`Quantity must be 1..${this.config.business.maxQtyPerOrderLine}`);
    }
    const cart = await this.activeCart(userId, false);
    if (!cart) throw AppError.notFound('Cart not found');
    const item = await this.prisma.cartItem.findUnique({ where: { cartId_variantId: { cartId: cart.id, variantId } } });
    if (!item) throw AppError.notFound('Cart item not found');
    await this.prisma.cartItem.update({ where: { id: item.id }, data: { quantity } });
  }

  async removeItem(userId: string, variantId: string): Promise<void> {
    const cart = await this.activeCart(userId, false);
    if (!cart) throw AppError.notFound('Cart not found');
    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id, variantId } });
  }

  /** Server-priced cart view — prices are displayOnly, never authoritative. */
  async getCart(userId: string): Promise<{ items: unknown[]; totals: { subtotal: number; displayOnly: true } }> {
    const cart = await this.activeCart(userId, false);
    if (!cart) return { items: [], totals: { subtotal: 0, displayOnly: true } };
    const items = await this.prisma.cartItem.findMany({
      where: { cartId: cart.id },
      include: {
        variant: {
          include: {
            product: { select: { id: true, name: true, slug: true, status: true, deletedAt: true, publishedAt: true } },
            color: true, size: true, inventory: { select: { onHand: true, reserved: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    const lines = [];
    let subtotal = 0;
    for (const item of items) {
      const v = item.variant;
      const purchasable = v.isActive && v.product.status === 'ACTIVE' && v.product.deletedAt === null
        && v.product.publishedAt !== null && v.product.publishedAt <= new Date();
      const price = await this.pricing.currentPriceOrNull(this.prisma, v.id);
      const unit = price ? (price.salePrice ?? price.basePrice) : null;
      const available = Math.max(0, (v.inventory?.onHand ?? 0) - (v.inventory?.reserved ?? 0));
      if (unit !== null) subtotal += unit * item.quantity;
      lines.push({
        variantId: v.id, sku: v.sku,
        product: { id: v.product.id, name: v.product.name, slug: v.product.slug },
        color: v.color?.displayName ?? null, size: v.size?.label ?? null,
        quantity: item.quantity, unitPrice: unit, lineTotal: unit !== null ? unit * item.quantity : null,
        available, purchasable,
      });
    }
    return { items: lines, totals: { subtotal, displayOnly: true } };
  }

  /**
   * Coupon preview — full validation, NO storage (the authoritative
   * validation+consumption happens inside the checkout transaction).
   */
  async validateCoupon(userId: string, code: string) {
    const cart = await this.activeCart(userId, false);
    if (!cart) throw AppError.notFound('Cart not found');
    const view = await this.getCart(userId);
    const lines = await this.cartTargetLines(this.prisma, cart.id);
    const check = await this.coupons.validateForCheckout(this.prisma, {
      code, userId, subtotal: view.totals.subtotal, lines,
    });
    return { code: check.code, discount: check.discount, valid: true };
  }

  async cartTargetLines(prisma: PrismaService, cartId: string) {
    const items = await prisma.cartItem.findMany({
      where: { cartId },
      include: {
        variant: { include: { product: { include: { categories: { include: { category: true } }, collections: true } } } },
      },
    });
    return items.map((i) => ({
      productId: i.variant.productId,
      categoryPathPrefixes: i.variant.product.categories.map((c) => c.category.path),
      collectionIds: i.variant.product.collections.map((c) => c.collectionId),
    }));
  }

  async activeCartOf(userId: string) {
    return this.activeCart(userId, false);
  }
}
