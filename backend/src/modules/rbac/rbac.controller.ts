import { Body, Controller, Get, Param, Post, Delete, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Permissions, CurrentUser, type AuthenticatedUser } from '../../common/decorators/auth.decorators';
import { PaginationDto, paginated } from '../../common/dto/pagination.dto';
import { AppError } from '../../common/errors/app-error';
import { ErrorCodes } from '../../common/errors/error-codes';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PermissionsGuard } from '../../common/guards/permissions.guard';

class AssignRolesDto {
  @ApiProperty({ type: [String], description: 'Role slugs, e.g. ["ORDER_MANAGER"]' })
  @IsArray() @IsString({ each: true }) roles!: string[];
}

class PermissionDto {
  @ApiProperty() @IsArray() @IsUUID(undefined, { each: true }) permissionIds!: string[];
}

class PermissionCreateDto {
  @ApiProperty({ example: 'order.export' }) @IsString() @MaxLength(80) slug!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) category?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) description?: string;
}

/**
 * RBAC administration.
 *
 * Every mutation invalidates the affected users' permission cache, because
 * `PermissionsGuard` caches the resolved slug set — without invalidation a
 * revoked role would keep working for up to a minute.
 */
@ApiBearerAuth('access-token')
@ApiTags('admin.rbac')
@Controller('admin/rbac')
export class RbacController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly permissionsGuard: PermissionsGuard,
  ) {}

  @Get('roles')
  @Permissions('roles.read')
  async roles() {
    const roles = await this.prisma.role.findMany({
      orderBy: { name: 'asc' },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
    });
    return roles.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      userCount: r._count.users,
      permissions: r.permissions.map((p) => p.permission.slug),
    }));
  }

  @Get('permissions')
  @Permissions('roles.read')
  permissions() {
    return this.prisma.permission.findMany({ orderBy: [{ category: 'asc' }, { slug: 'asc' }] });
  }

  @Post('permissions')
  @Permissions('roles.write')
  async createPermission(@Body() dto: PermissionCreateDto, @CurrentUser() actor: AuthenticatedUser) {
    const permission = await this.prisma.permission.create({
      data: { slug: dto.slug, category: dto.category ?? null, description: dto.description ?? null },
    });
    await this.audit.record(
      { actorType: 'ADMIN', actorId: actor.userId },
      { action: 'PERMISSION_CREATED', entityType: 'Permission', entityId: permission.id, newValues: { slug: permission.slug } },
    );
    return permission;
  }

  /** Replaces a role's permission set. */
  @Post('roles/:slug/permissions')
  @Permissions('roles.write')
  async setRolePermissions(
    @Param('slug') slug: string,
    @Body() dto: PermissionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const role = await this.prisma.role.findUnique({ where: { slug } });
    if (!role) throw AppError.notFound('Role not found', ErrorCodes.NOT_FOUND);

    const before = await this.prisma.rolePermission.findMany({
      where: { roleId: role.id },
      include: { permission: { select: { slug: true } } },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      await tx.rolePermission.createMany({
        data: dto.permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })),
        skipDuplicates: true,
      });
    });

    await this.invalidateRoleHolders(role.id);

    await this.audit.record(
      { actorType: 'ADMIN', actorId: actor.userId },
      {
        action: 'ROLE_PERMISSIONS_CHANGED',
        entityType: 'Role',
        entityId: role.id,
        oldValues: { permissions: before.map((p) => p.permission.slug) },
        newValues: { permissionCount: dto.permissionIds.length },
      },
    );
    return { updated: true, role: role.slug };
  }

  /** Replaces a user's roles. Blocks removing your own SUPER_ADMIN. */
  @Post('users/:userId/roles')
  @Permissions('roles.assign')
  async assignRoles(@Param('userId') userId: string, @Body() dto: AssignRolesDto, @CurrentUser() actor: AuthenticatedUser) {
    const target = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw AppError.notFound('User not found', ErrorCodes.NOT_FOUND);

    if (userId === actor.userId && !dto.roles.includes('SUPER_ADMIN')) {
      throw AppError.forbidden('You cannot remove your own SUPER_ADMIN role', ErrorCodes.FORBIDDEN);
    }

    const roles = await this.prisma.role.findMany({ where: { slug: { in: dto.roles } } });
    if (roles.length !== new Set(dto.roles).size) {
      throw AppError.badRequest('One or more role slugs do not exist');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId } });
      await tx.userRole.createMany({
        data: roles.map((r) => ({ userId, roleId: r.id, grantedById: actor.userId })),
      });
    });

    await this.permissionsGuard.invalidate(userId);

    await this.audit.record(
      { actorType: 'ADMIN', actorId: actor.userId },
      { action: 'ROLES_ASSIGNED', entityType: 'User', entityId: userId, newValues: { roles: dto.roles } },
    );
    return { updated: true, roles: dto.roles };
  }

  @Delete('users/:userId/roles/:roleSlug')
  @Permissions('roles.assign')
  async revokeRole(
    @Param('userId') userId: string,
    @Param('roleSlug') roleSlug: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    if (userId === actor.userId && roleSlug === 'SUPER_ADMIN') {
      throw AppError.forbidden('You cannot remove your own SUPER_ADMIN role', ErrorCodes.FORBIDDEN);
    }
    await this.prisma.userRole.deleteMany({ where: { userId, role: { slug: roleSlug } } });
    await this.permissionsGuard.invalidate(userId);

    await this.audit.record(
      { actorType: 'ADMIN', actorId: actor.userId },
      { action: 'ROLE_REVOKED', entityType: 'User', entityId: userId, newValues: { role: roleSlug } },
    );
    return { revoked: true };
  }

  @Get('users/:userId/roles')
  @Permissions('roles.read')
  async userRoles(@Param('userId') userId: string) {
    const rows = await this.prisma.userRole.findMany({ where: { userId }, include: { role: true } });
    return rows.map((r) => ({ slug: r.role.slug, name: r.role.name, grantedAt: r.grantedAt }));
  }

  /** Permission cache is keyed per user, so every holder must be invalidated. */
  private async invalidateRoleHolders(roleId: string): Promise<void> {
    const holders = await this.prisma.userRole.findMany({ where: { roleId }, select: { userId: true }, take: 500 });
    for (const h of holders) await this.permissionsGuard.invalidate(h.userId);
  }
}
