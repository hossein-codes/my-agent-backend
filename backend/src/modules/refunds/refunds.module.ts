import { Module } from '@nestjs/common';
import { RefundsService } from './refunds.service';
import { RefundsAdminController, RefundsController } from './refunds.controller';

@Module({
  providers: [RefundsService],
  controllers: [RefundsController, RefundsAdminController],
  exports: [RefundsService],
})
export class RefundsModule {}
