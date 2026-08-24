import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiPropertyOptional, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBooleanString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Public } from '../../common/decorators/auth.decorators';
import { PaginationDto, paginated } from '../../common/dto/pagination.dto';
import { CatalogService, type SortKey } from './catalog.service';

/**
 * Public storefront query parameters.
 *
 * Multi-value filters arrive as comma-separated strings (`?brands=a,b`) rather
 * than repeated keys, because that survives Next.js `searchParams` round-trips
 * and is trivial to share as a URL.
 */
class ProductListQueryDto extends PaginationDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsBooleanString() includeSubcategories?: string;
  @IsOptional() @IsString() brands?: string;
  @IsOptional() @IsString() collection?: string;
  @IsOptional() @IsString() colors?: string;
  @IsOptional() @IsString() sizes?: string;
  /** `material:cotton,linen|fit:regular` */
  @IsOptional() @IsString() attrs?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minPrice?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) maxPrice?: number;
  @IsOptional() @IsBooleanString() inStock?: string;
  @IsOptional() @IsBooleanString() onSale?: string;
  @IsOptional() @IsBooleanString() featured?: string;
  @IsOptional() @IsIn(['newest', 'price_asc', 'price_desc', 'popular', 'name']) sort?: SortKey;
}

/**
 * `@Type()` is a PropertyDecorator, so numeric coercion must live on a DTO —
 * stacking it on a `@Query()` parameter is a type error.
 */
class HighlightsQueryDto {
  @ApiPropertyOptional({ default: 8, maximum: 24 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(24) limit = 8;
}

class SuggestQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) q?: string;
}

function splitList(value?: string): string[] | undefined {
  if (!value) return undefined;
  const parts = value.split(',').map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts : undefined;
}

function parseAttrs(value?: string): Record<string, string[]> | undefined {
  if (!value) return undefined;
  const out: Record<string, string[]> = {};
  for (const group of value.split('|')) {
    const [key, raw] = group.split(':');
    if (!key || !raw) continue;
    out[key.trim()] = raw.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Public catalog endpoints — the storefront's entire read surface.
 *
 * Everything here is `@Public()`: browsing never requires auth.
 * Prices are Integer Toman; `priceFrom` is the cheapest currently-offered
 * variant, and `null` means nothing is purchasable.
 */
@ApiTags('catalog')
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('products')
  @Public()
  @ApiOperation({ summary: 'List/filter/search visible products' })
  async listProducts(@Query() q: ProductListQueryDto) {
    const result = await this.catalog.listProducts({
      page: q.page,
      pageSize: q.pageSize,
      search: q.search,
      categorySlug: q.category,
      includeSubcategories: q.includeSubcategories === 'true',
      brandSlugs: splitList(q.brands),
      collectionSlug: q.collection,
      colorSlugs: splitList(q.colors),
      // Sizes are matched by LABEL — see CatalogService.facets.
      sizeSlugs: splitList(q.sizes),
      attributes: parseAttrs(q.attrs),
      minPrice: q.minPrice,
      maxPrice: q.maxPrice,
      inStockOnly: q.inStock === 'true',
      onSaleOnly: q.onSale === 'true',
      featuredOnly: q.featured === 'true',
      sort: q.sort ?? 'newest',
    });
    return paginated(result.items, q, result.total);
  }

  @Get('products/:slug')
  @Public()
  @ApiOperation({ summary: 'Product detail with variants, prices, options and stock' })
  getProduct(@Param('slug') slug: string) {
    return this.catalog.getProductBySlug(slug);
  }

  @Get('categories')
  @Public()
  @ApiOperation({ summary: 'Active category tree' })
  categories() {
    return this.catalog.categoryTree();
  }

  @Get('brands')
  @Public()
  brands() {
    return this.catalog.brands();
  }

  @Get('collections')
  @Public()
  collections() {
    return this.catalog.collections();
  }

  @Get('facets')
  @Public()
  @ApiOperation({ summary: 'Filterable colours, sizes and attributes for the sidebar' })
  facets() {
    return this.catalog.facets();
  }

  @Get('highlights')
  @Public()
  @ApiOperation({ summary: 'Home-screen blocks (featured + newest)' })
  async highlights(@Query() q: HighlightsQueryDto) {
    return this.catalog.highlights(q.limit);
  }

  @Get('search/suggest')
  @Public()
  @ApiQuery({ name: 'q', required: true })
  async suggest(@Query() q: SuggestQueryDto) {
    const term = q.q?.trim();
    if (!term || term.length < 2) return { items: [] };
    return this.catalog.suggest(term);
  }
}
