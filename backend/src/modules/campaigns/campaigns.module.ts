import { Module } from '@nestjs/common';
import { CampaignsAdminController, CampaignsController } from './campaigns.controller';

@Module({ controllers: [CampaignsController, CampaignsAdminController] })
export class CampaignsModule {}
