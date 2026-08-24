import { Module } from '@nestjs/common';
import { CartService } from './cart.service';
import { CartController } from './cart.controller';
import { PricingModule } from '../pricing/pricing.module';
import { CouponsModule } from '../coupons/coupons.module';

@Module({
  imports: [PricingModule, CouponsModule],
  providers: [CartService], controllers: [CartController], exports: [CartService],
})
export class CartModule {}
