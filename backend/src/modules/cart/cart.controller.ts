import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsInt, IsString, IsUUID, Max, Min, MinLength } from 'class-validator';
import { CartService } from './cart.service';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/auth.decorators';
import { RateLimit } from '../../common/rate-limit/rate-limits';
import { RateLimitGuard } from '../../common/rate-limit/rate-limit.guard';

class AddItemDto {
  @IsUUID() variantId!: string;
  @IsInt() @Min(1) @Max(10) quantity!: number;
}
class UpdateItemDto {
  @IsInt() @Min(1) @Max(10) quantity!: number;
}
class CouponDto {
  @IsString() @MinLength(3) code!: string;
}

@ApiBearerAuth('access-token')
@ApiTags('cart')
@Controller('cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  async get(@CurrentUser() user: AuthenticatedUser) {
    return this.cart.getCart(user.userId);
  }

  @Post('items')
  async add(@CurrentUser() user: AuthenticatedUser, @Body() dto: AddItemDto) {
    await this.cart.addItem(user.userId, dto.variantId, dto.quantity);
    return this.cart.getCart(user.userId);
  }

  @Post('items/:variantId')
  async update(@CurrentUser() user: AuthenticatedUser, @Param('variantId') variantId: string, @Body() dto: UpdateItemDto) {
    await this.cart.updateItem(user.userId, variantId, dto.quantity);
    return this.cart.getCart(user.userId);
  }

  @Delete('items/:variantId')
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('variantId') variantId: string) {
    await this.cart.removeItem(user.userId, variantId);
    return this.cart.getCart(user.userId);
  }

  @Post('coupon/validate')
  @UseGuards(RateLimitGuard) @RateLimit('coupon.validate')
  async validateCoupon(@CurrentUser() user: AuthenticatedUser, @Body() dto: CouponDto) {
    return this.cart.validateCoupon(user.userId, dto.code);
  }
}
