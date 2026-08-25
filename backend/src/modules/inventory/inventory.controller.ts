import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators/auth.decorators';
import { CurrentUser, type AuthenticatedUser } from '../../common/decorators/auth.decorators';
import { PaginationDto, paginated } from '../../common/dto/pagination.dto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { InventoryService } from './inventory.service';

class StockAdjustDto {
  @ApiProperty({ example: 50, description: 'Signed integer; positive restocks, negative writes off' })
  @IsInt() delta!: number;

  @ApiProperty({ enum: ['RECEIPT', 'ADJUSTMENT', 'DAMAGE', 'RETURN'] })
  @IsIn(['RECEIPT', 'ADJUSTMENT', 'DAMAGE', 'RETURN']) type!: 'RECEIPT' | 'ADJUSTMENT' | 'DAMAGE' | 'RETURN';

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) note?: string;
}

@ApiBearerAuth('access-token')
@ApiTags('admin.inventory')
@Controller('admin/inventory')
export class AdminInventoryController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly prisma: PrismaService,
  ) {}

  /** Low-stock dashboard, ordered by scarcity. */
  @Get('low-stock')
  @Permissions('inventory.read')
  async lowStock(@Query() pagination: PaginationDto) {
    const where: Prisma.InventoryWhereInput = {
      variant: { isActive: true, product: { status: 'ACTIVE', deletedAt: null } },
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.inventory.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        include: {
          variant: {
            include: {
              product: { select: { id: true, name: true, slug: true } },
              color: { select: { displayName: true } },
              size: { select: { label: true } },
            },
          },
        },
      }),
      this.prisma.inventory.count({ where }),
    ]);

    const items = rows
      .map((r) => ({
        variantId: r.variantId,
        sku: r.variant.sku,
        product: r.variant.product,
        color: r.variant.color?.displayName ?? null,
        size: r.variant.size?.label ?? null,
        onHand: r.onHand,
        reserved: r.reserved,
        available: Math.max(0, r.onHand - r.reserved),
        lowStockThreshold: r.lowStockThreshold,
      }))
      .filter((i) => i.available <= i.lowStockThreshold)
      .sort((a, b) => a.available - b.available);

    return paginated(items, pagination, total);
  }

  @Get(':variantId')
  @Permissions('inventory.read')
  availability(@Param('variantId') variantId: string) {
    return this.inventory.availability(variantId);
  }

  @Get(':variantId/movements')
  @Permissions('inventory.read')
  async movements(@Param('variantId') variantId: string, @Query() pagination: PaginationDto) {
    const where = { variantId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.inventoryMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.inventoryMovement.count({ where }),
    ]);
    return paginated(items, pagination, total);
  }

  @Post(':variantId/adjust')
  @Permissions('inventory.write')
  adjust(
    @Param('variantId') variantId: string,
    @Body() dto: StockAdjustDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.inventory.adjust({
      variantId,
      delta: dto.delta,
      type: dto.type,
      actorId: actor.userId,
      note: dto.note,
    });
  }
}
