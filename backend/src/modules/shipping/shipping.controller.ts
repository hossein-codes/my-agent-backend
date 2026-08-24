import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Public } from '../../common/decorators/auth.decorators';
import { ShippingService } from './shipping.service';

class QuoteQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) province?: string;
  @ApiPropertyOptional({ default: 0, description: 'Cart subtotal in Toman, for free-shipping evaluation' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) subtotal = 0;
  @ApiPropertyOptional({ default: 0 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) weightGrams = 0;
}

/**
 * Shipping options shown on the checkout step.
 *
 * Public: browsing delivery options before signing in is normal, and the
 * authoritative price is recomputed server-side at order creation anyway.
 */
@ApiTags('shipping')
@Controller('shipping')
export class ShippingController {
  constructor(private readonly shipping: ShippingService) {}

  @Get('methods')
  @Public()
  @ApiOperation({ summary: 'Available shipping methods with prices for this cart' })
  methods(@Query() q: QuoteQueryDto) {
    return this.shipping.optionsFor({
      provinceName: q.province ?? '',
      orderSubtotal: q.subtotal,
      weightGrams: q.weightGrams,
    });
  }

  @Get('provinces')
  @Public()
  provinces() {
    return this.shipping.provinces();
  }
}
