import { Module } from '@nestjs/common';
import { AdminReturnsController, ReturnsController } from './returns.controller';

@Module({ controllers: [ReturnsController, AdminReturnsController] })
export class ReturnsModule {}
