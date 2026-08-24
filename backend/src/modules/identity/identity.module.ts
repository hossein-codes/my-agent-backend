import { Module } from '@nestjs/common';
import { AdminIdentityController, IdentityController } from './identity.controller';

@Module({ controllers: [IdentityController, AdminIdentityController] })
export class IdentityModule {}
