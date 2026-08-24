import { Module } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { CatalogController } from './catalog.controller';
import { AdminCatalogController } from './catalog-admin.controller';

@Module({
  providers: [CatalogService],
  controllers: [CatalogController, AdminCatalogController],
  exports: [CatalogService],
})
export class CatalogModule {}
