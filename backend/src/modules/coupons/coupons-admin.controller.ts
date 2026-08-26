import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Permissions, CurrentUser, type AuthenticatedUser } from '../../common/decorators/auth.decorators';
import { PaginationDto, paginated } from '../../common/dto/pagination.dto';
import { AppError } from '../../common/errors/app-error';
import { ErrorCodes } from '../../common/errors/error-codes';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

class CouponCreateDto {
  @ApiProperty({ example: 'SPRING20' }) @IsString() @MinLength(3) @MaxLength(32) code!: string;
  @ApiProperty({ example: 20, description: 'Integer percent, 1..100' }) @IsInt() @Min(1) @Max(100) percentOff!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) description?: string;
  @ApiPropertyOptional({ example: 500000 }) @IsOptional() @IsInt() @Min(0) minOrderAmount?: number;
  @ApiPropertyOptional({ example: 200000 }) @IsOptional() @IsInt() @Min(0) maxDiscountAmount?: number;
  @ApiProperty({ example: '2026-03-01T00:00:00.000Z' }) @IsString() startsAt!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() endsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) usageLimitTotal?: number;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @IsInt() @Min(1) usageLimitPerUser?: number;
}

@ApiBearerAuth('access-token')
@ApiTags('admin.coupons')
@Controller('admin/coupons')
export class CouponsAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @Permissions('settings.manage')
  async list(@Query() pagination: PaginationDto, @Query('status') status?: string) {
    const where = status ? { status: status as never } : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.coupon.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
        include: { _count: { select: { usages: true } } },
      }),
      this.prisma.coupon.count({ where }),
    ]);
    return paginated(
      items.map((c) => ({
        id: c.id,
        code: c.code,
        status: c.status,
        percentOff: c.percentOff,
        minOrderAmount: c.minOrderAmount,
        maxDiscountAmount: c.maxDiscountAmount,
        startsAt: c.startsAt,
        endsAt: c.endsAt,
        usageCount: c.usageCount,
        usageLimitTotal: c.usageLimitTotal,
        usageLimitPerUser: c.usageLimitPerUser,
        redemptions: c._count.usages,
      })),
      pagination,
      total,
    );
  }

  @Post()
  @Permissions('settings.manage')
  async create(@Body() dto: CouponCreateDto, @CurrentUser() actor: AuthenticatedUser) {
    const code = dto.code.trim().toUpperCase();
    const coupon = await this.prisma.coupon.create({
      data: {
        code,
        percentOff: dto.percentOff,
        description: dto.description ?? null,
        minOrderAmount: dto.minOrderAmount ?? 0,
        maxDiscountAmount: dto.maxDiscountAmount ?? null,
        startsAt: new Date(dto.startsAt),
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        usageLimitTotal: dto.usageLimitTotal ?? null,
        usageLimitPerUser: dto.usageLimitPerUser ?? 1,
        status: 'ACTIVE',
      },
    });
    await this.audit.record(
      { actorType: 'ADMIN', actorId: actor.userId },
      { action: 'COUPON_CREATED', entityType: 'Coupon', entityId: coupon.id, newValues: { code, percentOff: dto.percentOff } },
    );
    return coupon;
  }

  /** Deactivate rather than delete — usage history must stay intact. */
  @Patch(':id/status')
  @Permissions('settings.manage')
  async setStatus(
    @Param('id') id: string,
    @Body('status') status: 'ACTIVE' | 'INACTIVE' | 'EXPIRED',
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    if (!['ACTIVE', 'INACTIVE', 'EXPIRED'].includes(status)) {
      throw AppError.badRequest('status must be ACTIVE, INACTIVE or EXPIRED');
    }
    const before = await this.prisma.coupon.findUnique({ where: { id } });
    if (!before) throw AppError.notFound('Coupon not found', ErrorCodes.NOT_FOUND);

    const coupon = await this.prisma.coupon.update({ where: { id }, data: { status: status as never } });
    await this.audit.record(
      { actorType: 'ADMIN', actorId: actor.userId },
      {
        action: 'COUPON_STATUS_CHANGED',
        entityType: 'Coupon',
        entityId: id,
        oldValues: { status: before.status },
        newValues: { status: coupon.status },
      },
    );
    return { status: coupon.status };
  }

  @Get(':id/usages')
  @Permissions('settings.manage')
  async usages(@Param('id') id: string, @Query() pagination: PaginationDto) {
    const where = { couponId: id };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.couponUsage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
        include: { order: { select: { orderNumber: true, totalAmount: true } } },
      }),
      this.prisma.couponUsage.count({ where }),
    ]);
    return paginated(items, pagination, total);
  }
}
