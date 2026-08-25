import { Module, forwardRef } from '@nestjs/common';
import { OrderService } from './order.service';
import { OrderController, AdminOrderController } from './order.controller';
import { InventoryModule } from '../inventory/inventory.module';
import { RefundsModule } from '../refunds/refunds.module';
import { CouponsModule } from '../coupons/coupons.module';
@Module({
imports: [InventoryModule, CouponsModule, forwardRef(() => RefundsModule)],
  providers: [OrderService],
  controllers: [OrderController, AdminOrderController],
  exports: [OrderService],
})
export class OrdersModule {}
