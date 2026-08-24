import { Module } from '@nestjs/common';
import { RbacController } from './rbac.controller';
import { PermissionsGuard } from '../../common/guards/permissions.guard';

@Module({
  // PermissionsGuard is registered globally via APP_GUARD, but this module also
  // needs it injectable so role changes can invalidate the permission cache.
  providers: [PermissionsGuard],
  controllers: [RbacController],
})
export class RbacModule {}
