import { Module } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [OrdersModule],
  providers: [JobsService],
})
export class JobsModule {}
