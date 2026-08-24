import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { PricingService } from '../pricing/pricing.service';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/auth.decorators';
import { PaginationDto, paginated } from '../../common/dto/pagination.dto';
import { AppError } from '../../common/errors/app-error';

class AddDto {
  @IsUUID() productId!: string;
  @IsOptional() @IsUUID() variantId?: string;
}

@ApiBearerAuth('access-token')
@ApiTags('wishlist')
@Controller('wishlist')
export class WishlistController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser, @Query() pagination: PaginationDto) {
    const where = { wishlist: { userId: user.userId } }; // ownership filter (spec §6)
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.wishlistItem.findMany({
        where, orderBy: { createdAt: 'desc' },
        skip: pagination.skip, take: pagination.take,
        include: {
          product: { select: { id: true, name: true, slug: true, status: true } },
          variant: { include: { inventory: { select: { onHand: true, reserved: true } } } },
        },
      }),
      this.prisma.wishlistItem.count({ where }),
    ]);
    const items = await Promise.all(rows.map(async (r) => {
      const price = r.variantId ? await this.pricing.currentPriceOrNull(this.prisma, r.variantId) : null;
      return {
        productId: r.productId, name: r.product.name, slug: r.product.slug,
        variantId: r.variantId,
        available: r.variant ? Math.max(0, (r.variant.inventory?.onHand ?? 0) - (r.variant.inventory?.reserved ?? 0)) : null,
        price: price ? { base: price.basePrice, sale: price.salePrice } : null,
      };
    }));
    return paginated(items, pagination, total);
  }

  @Post()
  async add(@CurrentUser() user: AuthenticatedUser, @Body() dto: AddDto) {
    const product = await this.prisma.product.findFirst({ where: { id: dto.productId, deletedAt: null } });
    if (!product) throw AppError.notFound('Product not found');
    if (dto.variantId) {
      // L-6 FIX: the variant must belong to the given product
      const variant = await this.prisma.productVariant.findFirst({ where: { id: dto.variantId, productId: dto.productId } });
      if (!variant) throw AppError.badRequest('Variant does not belong to this product');
    }
    await this.prisma.wishlist.upsert({
      where: { userId: user.userId }, update: {}, create: { userId: user.userId },
    });
    // duplicate entries prevented by DB unique (wishlistId, productId)
    await this.prisma.$executeRaw`
      INSERT INTO "WishlistItem" ("id", "wishlistId", "productId", "variantId", "createdAt")
      SELECT gen_random_uuid(), w."id", ${dto.productId}::uuid, ${dto.variantId ?? null}::uuid, now()
      FROM "Wishlist" w WHERE w."userId" = ${user.userId}::uuid
      ON CONFLICT ("wishlistId", "productId") DO UPDATE SET "variantId" = EXCLUDED."variantId"`;
    return { added: true };
  }

  @Delete(':productId')
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('productId') productId: string) {
    await this.prisma.wishlistItem.deleteMany({
      where: { productId, wishlist: { userId: user.userId } }, // ownership filter
    });
    return { removed: true };
  }
}
