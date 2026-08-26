import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Permissions, CurrentUser, type AuthenticatedUser } from '../../common/decorators/auth.decorators';
import { PaginationDto, paginated } from '../../common/dto/pagination.dto';
import { AppError } from '../../common/errors/app-error';
import { ErrorCodes } from '../../common/errors/error-codes';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { PricingService } from '../pricing/pricing.service';
import { AuditService } from '../audit/audit.service';

class ProductCreateDto {
  @ApiProperty({ example: 'Cotton Crew Neck T-Shirt' })
  @IsString() @MinLength(2) @MaxLength(200) name!: string;

  @ApiPropertyOptional({ description: 'Auto-derived from name when omitted' })
  @IsOptional() @IsString() @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) @MaxLength(200) slug?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20000) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() brandId?: string;
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsUUID(undefined, { each: true }) categoryIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isFeatured?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) seoTitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(400) seoDescription?: string;
  @ApiPropertyOptional({ description: 'ISO-8601; omit to publish immediately' })
  @IsOptional() @IsString() publishedAt?: string;
}

class ProductUpdateDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) @MaxLength(200) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20000) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() brandId?: string;
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsUUID(undefined, { each: true }) categoryIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isFeatured?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) seoTitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(400) seoDescription?: string;
}

class VariantCreateDto {
  @ApiProperty({ example: 'TS-BLK-M' }) @IsString() @MinLength(2) @MaxLength(64) sku!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() colorId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() sizeId?: string;
  @ApiProperty({ example: 450000, description: 'Integer Toman' }) @IsInt() @Min(0) basePrice!: number;
  @ApiPropertyOptional({ example: 390000 }) @IsOptional() @IsInt() @Min(0) salePrice?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) initialStock?: number;
}

class PriceDto {
  @ApiProperty({ example: 450000 }) @IsInt() @Min(0) basePrice!: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) salePrice?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) note?: string;
}

class PublishDto {
  @ApiProperty({ enum: ['DRAFT', 'SCHEDULED', 'ACTIVE', 'INACTIVE', 'ARCHIVED'] })
  @IsIn(['DRAFT', 'SCHEDULED', 'ACTIVE', 'INACTIVE', 'ARCHIVED']) status!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() publishedAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() unpublishAt?: string;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Admin catalog management. Every mutation is audit-logged with an
 * old→new diff, because catalog changes are revenue-affecting.
 */
@ApiBearerAuth('access-token')
@ApiTags('admin.catalog')
@Controller('admin/catalog')
export class AdminCatalogController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly audit: AuditService,
  ) {}

  /** Unlike the public list, this includes drafts and soft-deleted rows. */
  @Get('products')
  @Permissions('products.read')
  async list(@Query() pagination: PaginationDto, @Query('status') status?: string, @Query('q') q?: string) {
    const where = {
      ...(status ? { status: status as never } : {}),
      ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
        include: {
          brand: { select: { name: true, slug: true } },
          _count: { select: { variants: true, orderItems: true } },
          variants: { where: { isActive: true }, select: { id: true }, take: 20 },
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    const prices = await this.pricing.currentPrices(this.prisma, items.flatMap((p) => p.variants.map((v) => v.id)));
    return paginated(
      items.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        status: p.status,
        brand: p.brand,
        publishedAt: p.publishedAt,
        deletedAt: p.deletedAt,
        isFeatured: p.isFeatured,
        variantCount: p._count.variants,
        // Lowest current price across variants, for the admin list column.
        priceFrom: (() => {
          const units = p.variants
            .map((v: { id: string }) => prices.get(v.id)?.unitPrice)
            .filter((n): n is number => typeof n === 'number');
          return units.length ? Math.min(...units) : null;
        })(),
        updatedAt: p.updatedAt,
      })),
      pagination,
      total,
    );
  }

  @Post('products')
  @Permissions('products.write')
  async create(@Body() dto: ProductCreateDto, @CurrentUser() actor: AuthenticatedUser) {
    const slug = dto.slug ?? (await this.uniqueSlug(slugify(dto.name)));
    const product = await this.prisma.product.create({
      data: {
        name: dto.name,
        slug,
        description: dto.description ?? null,
        brandId: dto.brandId ?? null,
        // A new product starts as DRAFT: it cannot be purchased until it has a
        // priced, in-stock variant and is explicitly published.
        status: 'DRAFT',
        isFeatured: dto.isFeatured ?? false,
        seoTitle: dto.seoTitle ?? null,
        seoDescription: dto.seoDescription ?? null,
        publishedAt: dto.publishedAt ? new Date(dto.publishedAt) : null,
        // basePrice is a display default only; VariantPrice is authoritative.
        basePrice: 0,
        categories: dto.categoryIds?.length
          ? { create: dto.categoryIds.map((categoryId) => ({ categoryId })) }
          : undefined,
      },
    });

    await this.audit.record(
      { actorType: 'ADMIN', actorId: actor.userId },
      { action: 'PRODUCT_CREATED', entityType: 'Product', entityId: product.id, newValues: { name: product.name, slug } },
    );
    return product;
  }

  @Patch('products/:id')
  @Permissions('products.write')
  async update(@Param('id') id: string, @Body() dto: ProductUpdateDto, @CurrentUser() actor: AuthenticatedUser) {
    const before = await this.prisma.product.findUnique({ where: { id } });
    if (!before || before.deletedAt) throw AppError.notFound('Product not found', ErrorCodes.PRODUCT_NOT_FOUND);

    const product = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id },
        data: {
          name: dto.name,
          description: dto.description,
          brandId: dto.brandId,
          isFeatured: dto.isFeatured,
          seoTitle: dto.seoTitle,
          seoDescription: dto.seoDescription,
        },
      });
      if (dto.categoryIds) {
        await tx.productCategory.deleteMany({ where: { productId: id } });
        await tx.productCategory.createMany({
          data: dto.categoryIds.map((categoryId) => ({ productId: id, categoryId })),
        });
      }
      return updated;
    });

    await this.audit.record(
      { actorType: 'ADMIN', actorId: actor.userId },
      {
        action: 'PRODUCT_UPDATED',
        entityType: 'Product',
        entityId: id,
        oldValues: { name: before.name, isFeatured: before.isFeatured },
        newValues: { name: product.name, isFeatured: product.isFeatured },
      },
    );
    return product;
  }

  @Patch('products/:id/status')
  @Permissions('products.write')
  async setStatus(@Param('id') id: string, @Body() dto: PublishDto, @CurrentUser() actor: AuthenticatedUser) {
    const before = await this.prisma.product.findUnique({ where: { id } });
    if (!before || before.deletedAt) throw AppError.notFound('Product not found', ErrorCodes.PRODUCT_NOT_FOUND);

    // Guard: publishing requires at least one active, priced variant, otherwise
    // the storefront would list a product that nobody can buy.
    if (dto.status === 'ACTIVE') {
      const priced = await this.prisma.productVariant.count({
        where: { productId: id, isActive: true, prices: { some: { effectiveTo: null } } },
      });
      if (priced === 0) {
        throw AppError.unprocessable(
          'A product needs at least one active variant with a current price before it can be published',
          ErrorCodes.PRODUCT_NOT_AVAILABLE,
        );
      }
    }

    const product = await this.prisma.product.update({
      where: { id },
      data: {
        status: dto.status as never,
        publishedAt: dto.publishedAt ? new Date(dto.publishedAt) : before.publishedAt ?? (dto.status === 'ACTIVE' ? new Date() : null),
        unpublishAt: dto.unpublishAt ? new Date(dto.unpublishAt) : null,
      },
    });

    await this.audit.record(
      { actorType: 'ADMIN', actorId: actor.userId },
      {
        action: 'PRODUCT_STATUS_CHANGED',
        entityType: 'Product',
        entityId: id,
        oldValues: { status: before.status },
        newValues: { status: product.status },
      },
    );
    return { status: product.status, publishedAt: product.publishedAt };
  }

  /** Soft delete — order history references the product, so it must survive. */
  @Delete('products/:id')
  @Permissions('products.delete')
  async softDelete(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw AppError.notFound('Product not found', ErrorCodes.PRODUCT_NOT_FOUND);

    await this.prisma.product.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'ARCHIVED', publishedAt: null },
    });
    await this.audit.record(
      { actorType: 'ADMIN', actorId: actor.userId },
      { action: 'PRODUCT_SOFT_DELETED', entityType: 'Product', entityId: id, oldValues: { status: product.status } },
    );
    return { deleted: true };
  }

  @Post('products/:id/variants')
  @Permissions('products.write')
  async addVariant(
    @Param('id') productId: string,
    @Body() dto: VariantCreateDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, deletedAt: null } });
    if (!product) throw AppError.notFound('Product not found', ErrorCodes.PRODUCT_NOT_FOUND);

    const variant = await this.prisma.$transaction(async (tx) => {
      const created = await tx.productVariant.create({
        data: {
          productId,
          sku: dto.sku,
          colorId: dto.colorId ?? null,
          sizeId: dto.sizeId ?? null,
          isActive: true,
          inventory: { create: { onHand: dto.initialStock ?? 0 } },
        },
      });
      if (dto.initialStock && dto.initialStock > 0) {
        const snapshot = await tx.inventory.findUniqueOrThrow({ where: { variantId: created.id } });
        await tx.inventoryMovement.create({
          data: {
            variantId: created.id,
            type: 'RESTOCK',
            quantity: dto.initialStock,
            onHandAfter: snapshot.onHand,
            reservedAfter: snapshot.reserved,
            actorId: actor.userId,
            source: 'ADMIN',
            note: 'initial stock on variant creation',
          },
        });
      }
      return created;
    });

    await this.pricing.setPrice({
      variantId: variant.id,
      basePrice: dto.basePrice,
      salePrice: dto.salePrice ?? null,
      actorId: actor.userId,
      note: 'initial price',
    });

    await this.audit.record(
      { actorType: 'ADMIN', actorId: actor.userId },
      {
        action: 'PRODUCT_VARIANT_CREATED',
        entityType: 'ProductVariant',
        entityId: variant.id,
        newValues: { sku: variant.sku, basePrice: dto.basePrice, initialStock: dto.initialStock ?? 0 },
      },
    );
    return variant;
  }

  @Patch('variants/:variantId/price')
  @Permissions('products.write')
  async setPrice(@Param('variantId') variantId: string, @Body() dto: PriceDto, @CurrentUser() actor: AuthenticatedUser) {
    const before = await this.pricing.currentPriceOrNull(this.prisma, variantId);
    const after = await this.pricing.setPrice({
      variantId,
      basePrice: dto.basePrice,
      salePrice: dto.salePrice ?? null,
      actorId: actor.userId,
      note: dto.note ?? null,
    });

    await this.audit.record(
      { actorType: 'ADMIN', actorId: actor.userId },
      {
        action: 'PRODUCT_PRICE_CHANGED',
        entityType: 'ProductVariant',
        entityId: variantId,
        oldValues: before ? { basePrice: before.basePrice, salePrice: before.salePrice } : null,
        newValues: { basePrice: after.basePrice, salePrice: after.salePrice },
      },
    );
    return after;
  }

  /** Colour/size/attribute reference data for the admin product form. */
  @Get('options')
  @Permissions('products.read')
  async options() {
    const [colors, sizes, attributes, brands] = await Promise.all([
      this.prisma.color.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.size.findMany({ orderBy: [{ sortOrder: 'asc' }, { numericValue: 'asc' }] }),
      this.prisma.attribute.findMany({ where: { isActive: true }, include: { values: { orderBy: { sortOrder: 'asc' } } } }),
      this.prisma.brand.findMany({ orderBy: { name: 'asc' } }),
    ]);
    return { colors, sizes, attributes, brands };
  }

  /** Appends -2, -3… until the slug is free. */
  private async uniqueSlug(base: string): Promise<string> {
    let candidate = base || 'product';
    for (let i = 2; i < 100; i += 1) {
      const existing = await this.prisma.product.findUnique({ where: { slug: candidate }, select: { id: true } });
      if (!existing) return candidate;
      candidate = `${base}-${i}`;
    }
    throw AppError.conflict('Could not generate a unique slug for this product');
  }
}
