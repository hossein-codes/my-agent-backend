import { Module } from '@nestjs/common';
import { AdminUsersController, UsersController } from './users.controller';
import { AuthModule } from '../auth/auth.module';

@Module({ imports: [AuthModule], controllers: [UsersController, AdminUsersController] })
export class UsersModule {}
