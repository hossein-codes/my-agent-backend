import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { Permissions, Public, CurrentUser, type AuthenticatedUser } from '../../common/decorators/auth.decorators';
import { PaginationDto, paginated } from '../../common/dto/pagination.dto';
import { AppError } from '../../common/errors/app-error';
import { ErrorCodes } from '../../common/errors/error-codes';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

class RuleDto {
  @ApiProperty({ enum: ['PERCENT', 'FIXED'] }) @IsIn(['PERCENT', 'FIXED']) discountType!: 'PERCENT' | 'FIXED';
  @ApiProperty({ description: 'PERCENT = 1..100, FIXED = Toman amount' }) @IsInt() @Min(1) discountValue!: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) maxDiscountAmount?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) minQuantity?: number;
}

class CampaignCreateDto {
  @ApiProperty() @IsString() @Min(2) @MaxLength(120) name!: string;
  @ApiProperty() @IsString() @MaxLength(120) slug!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @ApiProperty() @IsString() startsAt!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() endsAt?: string;
  @ApiProperty({ type: [RuleDto] }) @IsArray() rules!: RuleDto[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsUUID(undefined, { each: true }) productIds?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsUUID(undefined, { each: true }) categoryIds?: string[];
}

/**
 * Campaigns (spec §8/§9).
 *
 * A campaign is relational: rules + targets live in their own tables, so a
 * promotion is never hardcoded onto a product row. Ending a campaign does not
 * mutate products — it just stops matching.
 */
@ApiBearerAuth('access-token')
@ApiTags('admin.campaigns')
@Controller('admin/campaigns')
export class CampaignsAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @Permissions('products.read')
  async list(@Query() pagination: PaginationDto, @Query('status') status?: string) {
    const where = status ? { status: status as never } : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.campaign.findMany({
        where,
        orderBy: { startsAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
        include: { rules: { include: { targets: true } } },
      }),
      this.prisma.campaign.count({ where }),
    ]);
    return paginated(items, pagination, total);
  }

  @Post()
  @Permissions('products.write')
  async create(@Body() dto: CampaignCreateDto, @CurrentUser() actor: AuthenticatedUser) {
    if (dto.rules.some((r) => r.discountType === 'PERCENT' && r.discountValue > 100)) {
      throw AppError.badRequest('A PERCENT discount value must be between 1 and 100');
    }

    const campaign = await this.prisma.campaign.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        description: dto.description ?? null,
        startsAt: new Date(dto.startsAt),
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        status: 'DRAFT',
        rules: {
          create: dto.rules.map((r) => ({
            discountType: r.discountType,
            discountValue: r.discountValue,
            maxDiscountAmount: r.maxDiscountAmount ?? null,
            minQuantity: r.minQuantity ?? null,
            targets: dto.productIds?.length || dto.categoryIds?.length
              ? {
                  create: [
                    ...(dto.productIds ?? []).map((productId) => ({ targetType: 'PRODUCT' as const, productId })),
                    ...(dto.categoryIds ?? []).map((categoryId) => ({ targetType: 'CATEGORY' as const, categoryId })),
                  ],
                }
              : undefined,
          })),
        },
      },
      include: { rules: true },
    });

    await this.audit.record(
      { actorType: 'ADMIN', actorId: actor.userId },
      { action: 'CAMPAIGN_CREATED', entityType: 'Campaign', entityId: campaign.id, newValues: { slug: campaign.slug } },
    );
    return campaign;
  }

  @Patch(':id/status')
  @Permissions('products.write')
  async setStatus(
    @Param('id') id: string,
    @Body('status') status: 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'ENDED',
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    if (!['DRAFT', 'SCHEDULED', 'ACTIVE', 'ENDED'].includes(status)) {
      throw AppError.badRequest('status must be DRAFT, SCHEDULED, ACTIVE or ENDED');
    }
    const before = await this.prisma.campaign.findUnique({ where: { id } });
    if (!before) throw AppError.notFound('Campaign not found', ErrorCodes.NOT_FOUND);

    const campaign = await this.prisma.campaign.update({ where: { id }, data: { status: status as never } });
    await this.audit.record(
      { actorType: 'ADMIN', actorId: actor.userId },
      {
        action: 'CAMPAIGN_STATUS_CHANGED',
        entityType: 'Campaign',
        entityId: id,
        oldValues: { status: before.status },
        newValues: { status: campaign.status },
      },
    );
    return { status: campaign.status };
  }
}

@ApiTags('campaigns')
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly prisma: PrismaService) {}

  /** Campaigns live right now — used by the storefront for promo banners. */
  @Get('active')
  @Public()
  async active() {
    const now = new Date();
    const rows = await this.prisma.campaign.findMany({
      where: {
        status: 'ACTIVE',
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      select: { id: true, name: true, slug: true, description: true, startsAt: true, endsAt: true },
      orderBy: { startsAt: 'desc' },
      take: 10,
    });
    return rows;
  }
}
