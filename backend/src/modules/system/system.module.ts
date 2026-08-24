import { Global, Module } from '@nestjs/common';
import { FeaturesService } from './features.service';
import { SettingsService } from './settings.service';
import { AdminSystemController, PublicSettingsController } from './system.controller';

@Global()
@Module({
  providers: [FeaturesService, SettingsService],
  controllers: [PublicSettingsController, AdminSystemController],
  exports: [FeaturesService, SettingsService],
})
export class SystemModule {}
