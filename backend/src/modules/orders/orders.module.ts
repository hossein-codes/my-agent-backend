import { Module, forwardRef } from '@nestjs/common';
import { OrderService } from './order.service';
import { OrderController, AdminOrderController } from './order.controller';
import { InventoryModule } from '../inventory/inventory.module';
import { RefundsModule } from '../refunds/refunds.module';

@Module({
  imports: [InventoryModule, forwardRef(() => RefundsModule)],
  providers: [OrderService],
  controllers: [OrderController, AdminOrderController],
  exports: [OrderService],
})
export class OrdersModule {}
