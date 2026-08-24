import { Module } from '@nestjs/common';
import { CheckoutController } from './checkout.controller';
import { OrdersModule } from '../orders/orders.module';
import { CartModule } from '../cart/cart.module';
import { CouponsModule } from '../coupons/coupons.module';

@Module({
  imports: [OrdersModule, CartModule, CouponsModule],
  controllers: [CheckoutController],
})
export class CheckoutModule {}
