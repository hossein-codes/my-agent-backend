import { Body, Controller, Get, Headers, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { CurrentUser, type AuthenticatedUser } from '../../common/decorators/auth.decorators';
import { RateLimit } from '../../common/rate-limit/rate-limits';
import { RateLimitGuard } from '../../common/rate-limit/rate-limit.guard';
import { createHash } from 'node:crypto';
import { OrderService } from '../orders/order.service';
import { ShippingService } from '../shipping/shipping.service';
import { CartService } from '../cart/cart.service';
import { PricingService } from '../pricing/pricing.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CouponService } from '../coupons/coupon.service';

class AddressDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(80) receiverFirstName!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(80) receiverLastName!: string;
  @ApiProperty({ example: '+989121234567' }) @Matches(/^\+989\d{9}$/) receiverPhone!: string;
  @ApiProperty() @IsString() @MaxLength(80) provinceName!: string;
  @ApiProperty() @IsString() @MaxLength(80) cityName!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) district?: string;
  @ApiProperty({ example: '1234567890' }) @Matches(/^\d{10}$/, { message: 'postalCode must be 10 digits' }) postalCode!: string;
  @ApiProperty() @IsString() @MaxLength(300) line!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) unit?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) deliveryNotes?: string;
}

class CheckoutPreviewDto {
  @ApiProperty() @IsString() @MaxLength(80) provinceName!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(32) couponCode?: string;
}

class CheckoutSubmitDto extends AddressDto {
  @ApiProperty({ description: 'Shipping method id chosen from GET /shipping/methods' })
  @IsString() shippingMethodId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(32) couponCode?: string;
}

/**
 * Checkout (spec §28).
 *
 * Split into a read-only PREVIEW and a single atomic SUBMIT:
 *
 *   `POST /checkout/preview` — prices the cart with shipping and a coupon.
 *   Changes nothing. The frontend calls it on every step change.
 *
 *   `POST /checkout`         — converts the cart into an order in ONE
 *   transaction. Re-prices everything server-side; the preview totals are
 *   never trusted. Carries an `Idempotency-Key` header so a double-click
 *   cannot create two orders.
 *
 * Both are authenticated: an anonymous cart is out of scope for v1.
 */
@ApiBearerAuth('access-token')
@ApiTags('checkout')
@Controller('checkout')
export class CheckoutController {
  constructor(
    private readonly orders: OrderService,
    private readonly shipping: ShippingService,
    private readonly cart: CartService,
    private readonly pricing: PricingService,
    private readonly prisma: PrismaService,
    private readonly coupons: CouponService,
  ) {}

  @Post('preview')
  @UseGuards(RateLimitGuard)
  @RateLimit('coupon.validate')
  @ApiOperation({ summary: 'Price the cart with shipping and a coupon (no changes made)' })
  async preview(@CurrentUser() user: AuthenticatedUser, @Body() dto: CheckoutPreviewDto) {
    const view = await this.cart.getCart(user.userId);
    const cart = await this.cart.activeCartOf(user.userId);
    if (!cart) return { items: [], subtotal: 0, shippingOptions: [], totals: { total: 0 } };

    const weightGrams = await this.totalWeight(cart.id);
    const shippingOptions = await this.shipping.optionsFor({
      provinceName: dto.provinceName,
      orderSubtotal: view.totals.subtotal,
      weightGrams,
    });

    // An invalid code must not break the preview — the UI shows the reason
    // inline and keeps the rest of the totals visible.
    let coupon: { code: string; discount: number; percentOff: number; capped: boolean } | null = null;
    let couponError: string | null = null;
    if (dto.couponCode) {
      try {
        const lines = await this.cart.cartTargetLines(this.prisma, cart.id);
        const validation = await this.coupons.validateForCheckout(this.prisma, {
          code: dto.couponCode,
          userId: user.userId,
          subtotal: view.totals.subtotal,
          lines,
        });
        coupon = {
          code: validation.code,
          discount: validation.discount,
          percentOff: validation.percentOff,
          capped: validation.capped,
        };
      } catch (err) {
        couponError = (err as Error).message;
      }
    }

    const shippingPrices = shippingOptions.map((o: { amount: number }) => o.amount);
    const cheapest = shippingPrices.length ? Math.min(...shippingPrices) : null;
    const discount = coupon?.discount ?? 0;
    const total = Math.max(0, view.totals.subtotal - discount) + (cheapest ?? 0);

    return {
      items: view.items,
      subtotal: view.totals.subtotal,
      coupon,
      couponError,
      shippingOptions,
      totals: {
        subtotal: view.totals.subtotal,
        couponDiscount: discount,
        shippingFrom: cheapest ?? 0,
        total,
        // Reminder for the UI: preview totals are indicative. The submit step
        // re-prices everything and its numbers are the binding ones.
        displayOnly: true,
        currency: 'IRT',
      },
    };
  }

  @Post()
  @UseGuards(RateLimitGuard)
  @RateLimit('payment.initiate')
  @ApiOperation({ summary: 'Convert the cart into an order (atomic, idempotent)' })
  async submit(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CheckoutSubmitDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const order = await this.orders.createFromCart({
      userId: user.userId,
      address: {
        receiverFirstName: dto.receiverFirstName,
        receiverLastName: dto.receiverLastName,
        receiverPhone: dto.receiverPhone,
        provinceName: dto.provinceName,
        cityName: dto.cityName,
        district: dto.district,
        postalCode: dto.postalCode,
        line: dto.line,
        unit: dto.unit,
        deliveryNotes: dto.deliveryNotes,
      },
      shippingMethodId: dto.shippingMethodId,
      couponCode: dto.couponCode,
      idempotencyKey: idempotencyKey?.slice(0, 120),
      // Hash of the normalized request: replaying the key with a different
      // body is a conflict, not a silent reuse.
      requestHash: this.hashRequest(user.userId, dto),
    });

    return { orderId: order.id, orderNumber: order.orderNumber, totals: order.totals, status: order.status };
  }

  @Get('summary')
  @ApiOperation({ summary: 'Lightweight cart summary for the sticky checkout bar' })
  async summary(@CurrentUser() user: AuthenticatedUser) {
    const view = await this.cart.getCart(user.userId);
    return {
      itemCount: view.items.length,
      subtotal: view.totals.subtotal,
      currency: 'IRT',
    };
  }

  private async totalWeight(cartId: string): Promise<number> {
    const items = await this.prisma.cartItem.findMany({
      where: { cartId },
      select: { quantity: true, variant: { select: { weightGrams: true } } },
    });
    return items.reduce((sum, i) => sum + (i.variant.weightGrams ?? 0) * i.quantity, 0);
  }

  private hashRequest(userId: string, dto: CheckoutSubmitDto): string {
    const normalized = JSON.stringify({
      u: userId,
      s: dto.shippingMethodId,
      c: dto.couponCode ?? null,
      a: [dto.receiverPhone, dto.postalCode, dto.provinceName, dto.cityName, dto.line],
    });
    return createHash('sha256').update(normalized).digest('hex');
  }
}
