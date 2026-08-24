import { Global, Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { AdminInventoryController } from './inventory.controller';

@Global()
@Module({
  providers: [InventoryService],
  controllers: [AdminInventoryController],
  exports: [InventoryService],
})
export class InventoryModule {}
