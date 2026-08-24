import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SessionService } from '../auth/session.service';
import { RedisService } from '../../shared/redis/redis.service';
import { normalizePhone } from '../auth/otp.service';
import { CurrentUser, AuthenticatedUser, Permissions } from '../../common/decorators/auth.decorators';
import { AppError } from '../../common/errors/app-error';
import { ErrorCodes } from '../../common/errors/error-codes';
import { PaginationDto, paginated } from '../../common/dto/pagination.dto';

class UpdateProfileDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) firstName?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) lastName?: string;
}
class AddPhoneDto {
  @IsString() @Matches(/^\+989\d{9}$/, { message: 'phone must be +989xxxxxxxxx' })
  phone!: string;
  @IsOptional() @IsString() @MaxLength(40) label?: string;
}
class AddEmailDto {
  @IsString() @Matches(/^[^@\s]+@[^@\s]+\.[^@\s]+$/) email!: string;
  @IsOptional() @IsString() @MaxLength(40) label?: string;
}
class AdminUserStatusDto {
  @IsIn(['ACTIVE', 'BLOCKED']) status!: 'ACTIVE' | 'BLOCKED';
  @IsOptional() @IsString() @MaxLength(200) reason?: string;
}

@ApiBearerAuth('access-token')
@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    const profile = await this.prisma.user.findUnique({
      where: { id: user.userId },
      include: {
        profile: true,
        phones: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
        emails: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
        roles: { include: { role: true } },
      },
    });
    if (!profile) throw AppError.notFound();
    return {
      id: profile.id,
      status: profile.status,
      profile: profile.profile,
      phones: profile.phones.map((p) => ({ id: p.id, phone: p.phone, label: p.label, isPrimary: p.isPrimary, verifiedAt: p.verifiedAt })),
      emails: profile.emails.map((e) => ({ id: e.id, email: e.email, label: e.label, isPrimary: e.isPrimary, verifiedAt: e.verifiedAt })),
      roles: profile.roles.map((r) => r.role.slug),
      // L-1 FIX: real identity status (was hardcoded false)
      identityVerified: (await this.prisma.identityVerificationRequest.count({
        where: { userId: user.userId, status: 'APPROVED' },
      })) > 0,
      createdAt: profile.createdAt,
    };
  }

  @Patch('me')
  async updateMe(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateProfileDto) {
    await this.prisma.userProfile.upsert({
      where: { userId: user.userId },
      update: { firstName: dto.firstName, lastName: dto.lastName },
      create: { userId: user.userId, firstName: dto.firstName, lastName: dto.lastName },
    });
    return { updated: true };
  }

  @Post('me/phones')
  async addPhone(@CurrentUser() user: AuthenticatedUser, @Body() dto: AddPhoneDto) {
    const phone = normalizePhone(dto.phone);
    const existing = await this.prisma.userPhone.findUnique({ where: { phone } });
    if (existing) throw AppError.conflict('Phone already registered', ErrorCodes.CONFLICT);
    const count = await this.prisma.userPhone.count({ where: { userId: user.userId } });
    if (count >= 5) throw AppError.badRequest('Too many phone numbers');
    return this.prisma.userPhone.create({
      data: { userId: user.userId, phone, label: dto.label, isPrimary: false }, // verification required before primary
    });
  }

  @Delete('me/phones/:id')
  async removePhone(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    // ownership filter — never find-then-check (spec §6)
    const phone = await this.prisma.userPhone.findFirst({ where: { id, userId: user.userId } });
    if (!phone) throw AppError.notFound();
    if (phone.isPrimary) throw AppError.badRequest('Cannot remove the primary phone');
    await this.prisma.userPhone.delete({ where: { id } });
    return { removed: true };
  }

  @Post('me/emails')
  async addEmail(@CurrentUser() user: AuthenticatedUser, @Body() dto: AddEmailDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.userEmail.findUnique({ where: { email } });
    if (existing) throw AppError.conflict('Email already registered', ErrorCodes.CONFLICT);
    return this.prisma.userEmail.create({
      data: { userId: user.userId, email, label: dto.label, isPrimary: false },
    });
  }

  @Delete('me/emails/:id')
  async removeEmail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const email = await this.prisma.userEmail.findFirst({ where: { id, userId: user.userId } });
    if (!email) throw AppError.notFound();
    if (email.isPrimary) throw AppError.badRequest('Cannot remove the primary email');
    await this.prisma.userEmail.delete({ where: { id } });
    return { removed: true };
  }
}

@ApiBearerAuth('access-token')
@ApiTags('admin.users')
@Controller('admin/users')
export class AdminUsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sessions: SessionService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  @Permissions('user.manage')
  async list(@Query() pagination: PaginationDto, @Query('q') q?: string) {
    const where = q
      ? { OR: [
          { phones: { some: { phone: { contains: q } } } },
          { emails: { some: { email: { contains: q.toLowerCase() } } } },
        ] }
      : undefined;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where, orderBy: { createdAt: 'desc' },
        skip: pagination.skip, take: pagination.take,
        include: { profile: true, phones: { where: { isPrimary: true } }, roles: { include: { role: true } } },
      }),
      this.prisma.user.count({ where }),
    ]);
    return paginated(
      items.map((u) => ({
        id: u.id, status: u.status, profile: u.profile,
        primaryPhone: u.phones[0]?.phone ?? null,
        roles: u.roles.map((r) => r.role.slug), createdAt: u.createdAt,
      })),
      pagination, total,
    );
  }

  @Patch(':id/status')
  @Permissions('user.manage')
  async setStatus(@Param('id') id: string, @Body() dto: AdminUserStatusDto, @CurrentUser() actor: AuthenticatedUser) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw AppError.notFound('User not found');
    if (id === actor.userId) throw AppError.forbidden('Cannot change your own status', ErrorCodes.FORBIDDEN);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { status: dto.status } });
      if (dto.status === 'BLOCKED') {
        await tx.authSession.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date(), revokedReason: 'ADMIN' },
        });
      }
    });
    await this.audit.record(
      { actorType: 'ADMIN', actorId: actor.userId, actorRole: null },
      { action: `USER_${dto.status}`, entityType: 'User', entityId: id, oldValues: { status: user.status }, newValues: { status: dto.status, reason: dto.reason } },
    );
    await this.redis.del(`ustatus:${id}`); // M-2: immediate effect
    return { status: dto.status };
  }

  @Delete(':id')
  @Permissions('user.manage')
  async softDelete(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    if (id === actor.userId) throw AppError.forbidden('Cannot delete your own account', ErrorCodes.FORBIDDEN);
    await this.prisma.user.update({ where: { id }, data: { status: 'DELETED', deletedAt: new Date() } });
    await this.sessions.revokeAllForUser(id, 'ACCOUNT_DELETED');
    await this.redis.del(`ustatus:${id}`); // M-2: immediate effect
    await this.audit.record(
      { actorType: 'ADMIN', actorId: actor.userId },
      { action: 'USER_SOFT_DELETED', entityType: 'User', entityId: id },
    );
    return { deleted: true };
  }
}

