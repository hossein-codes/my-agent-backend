import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { PricingService } from '../pricing/pricing.service';
import { InventoryService } from '../inventory/inventory.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCodes } from '../../common/errors/error-codes';

export type SortKey = 'newest' | 'price_asc' | 'price_desc' | 'popular' | 'name';

export interface ProductListQuery {
  page: number;
  pageSize: number;
  search?: string;
  categorySlug?: string;
  /** Includes the whole subtree — uses the materialized `path` column. */
  includeSubcategories?: boolean;
  brandSlugs?: string[];
  collectionSlug?: string;
  colorSlugs?: string[];
  sizeSlugs?: string[];
  /** Attribute facet filters, e.g. `material:cotton,linen`. */
  attributes?: Record<string, string[]>;
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
  onSaleOnly?: boolean;
  featuredOnly?: boolean;
  sort?: SortKey;
}

/**
 * Public catalog reads.
 *
 * Visibility rule applied to EVERY public query: a product is visible only
 * when `status = ACTIVE`, `deletedAt IS NULL`, and `publishedAt <= now()`.
 * Scheduled products (`SCHEDULED` with a future `publishedAt`) stay hidden
 * until their moment — the storefront must never show a product that cannot
 * be bought.
 */
@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly inventory: InventoryService,
  ) {}

  /** The single visibility predicate for public catalog queries. */
  private visibleWhere(now = new Date()): Prisma.ProductWhereInput {
    return {
      status: 'ACTIVE',
      deletedAt: null,
      publishedAt: { not: null, lte: now },
      OR: [{ unpublishAt: null }, { unpublishAt: { gt: now } }],
    };
  }

  async listProducts(query: ProductListQuery) {
    const where = await this.buildWhere(query);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy: this.orderBy(query.sort),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          brand: { select: { name: true, slug: true } },
          categories: {
            select: { category: { select: { name: true, slug: true, path: true } } },
            take: 1,
          },
          media: {
            where: { status: 'ACTIVE' },
            orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
            take: 1,
            select: { url: true, alt: true, type: true },
          },
          variants: {
            where: { isActive: true },
            select: { id: true },
          },
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    const variantIds = rows.flatMap((p) => p.variants.map((v) => v.id));
    const [prices, stock] = await Promise.all([
      this.pricing.currentPrices(this.prisma, variantIds),
      this.inventory.availabilityFor(variantIds),
    ]);

    const items = rows.map((p) => this.toListItem(p, prices, stock));
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async getProductBySlug(slug: string) {
    const product = await this.prisma.product.findFirst({
      where: { slug, ...this.visibleWhere() },
      include: {
        brand: { select: { name: true, slug: true, logoUrl: true } },
        categories: { select: { category: { select: { name: true, slug: true, path: true } } } },
        collections: {
          where: { collection: { isActive: true } },
          select: { collection: { select: { name: true, slug: true } } },
        },
        tags: { where: { tag: { isActive: true } }, select: { tag: { select: { name: true, slug: true } } } },
        media: {
          where: { status: 'ACTIVE' },
          orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
          select: { id: true, url: true, alt: true, type: true },
        },
        attributes: {
          include: {
            attribute: { select: { name: true, slug: true, type: true } },
            attributeValue: { select: { label: true, slug: true } },
          },
        },
        variants: {
          where: { isActive: true },
          include: {
            color: { select: { id: true, name: true, displayName: true, slug: true, hexCode: true } },
            size: { select: { id: true, label: true, type: true, sortOrder: true, numericValue: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!product) throw AppError.notFound('Product not found', ErrorCodes.PRODUCT_NOT_FOUND);

    const variantIds = product.variants.map((v) => v.id);
    const [prices, stock] = await Promise.all([
      this.pricing.currentPrices(this.prisma, variantIds),
      this.inventory.availabilityFor(variantIds),
    ]);

    // Option axes are derived from live variants so the UI can never offer a
    // colour/size combination that has no SKU behind it.
    const options = this.buildOptionAxes(product.variants, prices, stock);

    const variants = product.variants.map((v) => {
      const price = prices.get(v.id);
      const avail = stock.get(v.id);
      return {
        id: v.id,
        sku: v.sku,
        colorId: v.color?.id ?? null,
        color: v.color?.displayName ?? null,
        colorHex: v.color?.hexCode ?? null,
        sizeId: v.size?.id ?? null,
        size: v.size?.label ?? null,
        price: price
          ? { base: price.basePrice, sale: price.salePrice, unit: price.unitPrice, discountPercent: price.discountPercent, onSale: price.onSale }
          : null,
        available: avail?.available ?? 0,
        purchasable: (avail?.available ?? 0) > 0 && price !== undefined,
      };
    });

    // Cheapest purchasable variant drives the "from" price on the card.
    const purchasable = variants.filter((v) => v.purchasable && v.price !== null);
    const unitPrices = purchasable.map((v) => v.price?.unit).filter((p): p is number => typeof p === 'number');
    const cheapest = unitPrices.length ? Math.min(...unitPrices) : null;

    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      brand: product.brand,
      categories: product.categories.map((c) => c.category),
      collections: product.collections.map((c) => c.collection),
      tags: product.tags.map((t) => t.tag),
      media: product.media,
      attributes: product.attributes.map((a) => ({
        name: a.attribute.name,
        slug: a.attribute.slug,
        value: a.attributeValue?.label ?? a.rawValue,
      })),
      options,
      variants,
      priceFrom: cheapest,
      isFeatured: product.isFeatured,
      seo: { title: product.seoTitle, description: product.seoDescription },
      publishedAt: product.publishedAt,
    };
  }

  /** Category tree, active branches only. */
  async categoryTree() {
    const rows = await this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { products: true } } },
    });

    type Node = {
      id: string;
      name: string;
      slug: string;
      path: string;
      productCount: number;
      children: Node[];
    };
    const byId = new Map<string, Node>();
    for (const r of rows) {
      byId.set(r.id, {
        id: r.id,
        name: r.name,
        slug: r.slug,
        path: r.path,
        productCount: r._count.products,
        children: [],
      });
    }
    const roots: Node[] = [];
    for (const r of rows) {
      const node = byId.get(r.id) as Node;
      const parent = r.parentId ? byId.get(r.parentId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    return roots;
  }

  async brands() {
    const rows = await this.prisma.brand.findMany({
      where: { isActive: true, products: { some: { ...this.visibleWhere() } } },
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: true } } },
    });
    return rows.map((b) => ({
      id: b.id,
      name: b.name,
      slug: b.slug,
      logoUrl: b.logoUrl,
      productCount: b._count.products,
    }));
  }

  async collections() {
    const now = new Date();
    return this.prisma.collection.findMany({
      where: {
        isActive: true,
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, slug: true, description: true, imageUrl: true },
    });
  }

  /**
   * Filter facets for the storefront sidebar: only attributes marked
   * `isFilterable`, with values that actually match a visible product.
   */
  async facets() {
    const [colors, sizes, attributes] = await Promise.all([
      this.prisma.color.findMany({
        where: { status: 'ACTIVE', variants: { some: { isActive: true, product: this.visibleWhere() } } },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, displayName: true, slug: true, hexCode: true },
      }),
      this.prisma.size.findMany({
        where: { variants: { some: { isActive: true, product: this.visibleWhere() } } },
        orderBy: [{ sortOrder: 'asc' }, { numericValue: 'asc' }],
        select: { id: true, label: true, type: true },
      }),
      this.prisma.attribute.findMany({
        where: { isActive: true, isFilterable: true },
        orderBy: { name: 'asc' },
        include: { values: { orderBy: { sortOrder: 'asc' } } },
      }),
    ]);

    return {
      colors,
      // Size has no slug column — the label is the stable filter key.
      sizes: (sizes as Array<{ id: string; label: string; type: string }>).map((s) => ({
        id: s.id,
        label: s.label,
        type: s.type,
        slug: s.label.toLowerCase().replace(/\s+/g, '-'),
      })),
      attributes: attributes.map((a) => ({
        name: a.name,
        slug: a.slug,
        type: a.type,
        values: a.values.map((v) => ({ label: v.label, slug: v.slug })),
      })),
    };
  }

  /** Home-screen blocks: featured, newest, and on-sale products. */
  async highlights(limit = 8) {
    const [featured, newest] = await Promise.all([
      this.prisma.product.findMany({
        where: { ...this.visibleWhere(), isFeatured: true },
        orderBy: { updatedAt: 'desc' },
        take: limit,
        include: { variants: { where: { isActive: true }, select: { id: true } }, media: { where: { status: 'ACTIVE' }, orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }], take: 1, select: { url: true, alt: true } }, brand: { select: { name: true, slug: true } }, categories: { select: { category: { select: { name: true, slug: true } } }, take: 1 } },
      }),
      this.prisma.product.findMany({
        where: this.visibleWhere(),
        orderBy: { publishedAt: 'desc' },
        take: limit,
        include: { variants: { where: { isActive: true }, select: { id: true } }, media: { where: { status: 'ACTIVE' }, orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }], take: 1, select: { url: true, alt: true } }, brand: { select: { name: true, slug: true } }, categories: { select: { category: { select: { name: true, slug: true } } }, take: 1 } },
      }),
    ]);

    const ids = [...featured, ...newest].flatMap((p) => p.variants.map((v) => v.id));
    const [prices, stock] = await Promise.all([
      this.pricing.currentPrices(this.prisma, ids),
      this.inventory.availabilityFor(ids),
    ]);

    const shape = (list: typeof featured) => list.map((p) => this.toListItem(p, prices, stock));
    return { featured: shape(featured), newest: shape(newest) };
  }

  /**
   * Typeahead for the search box: product names plus matching categories and
   * brands, so a partial query can navigate instead of returning an empty grid.
   */
  async suggest(term: string, limit = 8): Promise<{ items: Array<{ type: string; label: string; href: string }> }> {
    const [products, categories, brands] = await Promise.all([
      this.prisma.product.findMany({
        where: { ...this.visibleWhere(), name: { contains: term, mode: 'insensitive' } },
        orderBy: { isFeatured: 'desc' },
        take: limit,
        select: { name: true, slug: true },
      }),
      this.prisma.category.findMany({
        where: { isActive: true, name: { contains: term, mode: 'insensitive' } },
        take: 3,
        select: { name: true, slug: true },
      }),
      this.prisma.brand.findMany({
        where: { isActive: true, name: { contains: term, mode: 'insensitive' } },
        take: 3,
        select: { name: true, slug: true },
      }),
    ]);

    return {
      items: [
        ...products.map((p) => ({ type: 'product', label: p.name, href: `/products/${p.slug}` })),
        ...categories.map((c) => ({ type: 'category', label: c.name, href: `/category/${c.slug}` })),
        ...brands.map((b) => ({ type: 'brand', label: b.name, href: `/brand/${b.slug}` })),
      ].slice(0, limit + 6),
    };
  }

  // --- internals -------------------------------------------------------------

  private async buildWhere(query: ProductListQuery): Promise<Prisma.ProductWhereInput> {
    const where: Prisma.ProductWhereInput = { ...this.visibleWhere() };

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
        { variants: { some: { sku: { contains: term, mode: 'insensitive' } } } },
      ];
    }

    if (query.categorySlug) {
      if (query.includeSubcategories) {
        // Materialized path makes a whole-subtree filter a single prefix match.
        const category = await this.prisma.category.findUnique({
          where: { slug: query.categorySlug },
          select: { path: true },
        });
        if (category) {
          where.categories = { some: { category: { path: { startsWith: category.path } } } };
        } else {
          where.categories = { some: { category: { slug: query.categorySlug } } };
        }
      } else {
        where.categories = { some: { category: { slug: query.categorySlug } } };
      }
    }

    if (query.brandSlugs?.length) where.brand = { slug: { in: query.brandSlugs } };
    if (query.collectionSlug) {
      where.collections = { some: { collection: { slug: query.collectionSlug, isActive: true } } };
    }
    if (query.featuredOnly) where.isFeatured = true;

    const variantFilters: Prisma.ProductVariantWhereInput[] = [];
    if (query.colorSlugs?.length) variantFilters.push({ color: { slug: { in: query.colorSlugs } } });
    if (query.sizeSlugs?.length) {
      // Size is keyed by label, not slug (see facets()).
      // `Size` has no slug column — the label IS the stable filter key, so the
      // storefront sends labels here (see facets()).
      variantFilters.push({ size: { label: { in: query.sizeSlugs } } });
    }
    if (query.inStockOnly) variantFilters.push({ inventory: { onHand: { gt: 0 } } });
    if (variantFilters.length) where.variants = { some: { isActive: true, AND: variantFilters } };

    if (query.attributes && Object.keys(query.attributes).length) {
      where.attributes = {
        some: {
          attribute: { slug: { in: Object.keys(query.attributes) } },
          attributeValue: { slug: { in: Object.values(query.attributes).flat() } },
        },
      };
    }

    // Price bounds apply to the CURRENT variant price, never Product.basePrice.
    if (query.minPrice !== undefined || query.maxPrice !== undefined || query.onSaleOnly) {
      const priceWhere: Prisma.VariantPriceWhereInput = { effectiveTo: null };
      if (query.minPrice !== undefined) priceWhere.OR = [{ salePrice: { gte: query.minPrice } }, { salePrice: null, basePrice: { gte: query.minPrice } }];
      if (query.maxPrice !== undefined) {
        priceWhere.OR = [{ salePrice: { lte: query.maxPrice } }, { salePrice: null, basePrice: { lte: query.maxPrice } }];
      }
      if (query.onSaleOnly) priceWhere.salePrice = { not: null };
      where.variants = {
        some: {
          isActive: true,
          ...(where.variants as Prisma.ProductVariantWhereInput | undefined),
          prices: { some: priceWhere },
        },
      };
    }

    return where;
  }

  private orderBy(sort: SortKey = 'newest'): Prisma.ProductOrderByWithRelationInput[] {
    switch (sort) {
      case 'price_asc':
        return [{ variants: { _count: 'asc' } }, { publishedAt: 'desc' }];
      case 'price_desc':
        return [{ variants: { _count: 'desc' } }, { publishedAt: 'desc' }];
      case 'name':
        return [{ name: 'asc' }];
      case 'popular':
        // Popularity is approximated by order volume; a real ranking arrives
        // with the reports module.
        return [{ orderItems: { _count: 'desc' } }, { publishedAt: 'desc' }];
      default:
        return [{ publishedAt: 'desc' }];
    }
  }

  private toListItem(
    p: {
      id: string;
      name: string;
      slug: string;
      isFeatured: boolean;
      brand: { name: string; slug: string } | null;
      categories: Array<{ category: { name: string; slug: string } }>;
      media: Array<{ url: string; alt: string | null }>;
      variants: Array<{ id: string }>;
    },
    prices: Map<string, { unitPrice: number; basePrice: number; salePrice: number | null; discountPercent: number; onSale: boolean }>,
    stock: Map<string, { available: number }>,
  ) {
    let priceFrom: number | null = null;
    let baseFrom: number | null = null;
    let maxDiscount = 0;
    let anyAvailable = false;

    for (const v of p.variants) {
      const price = prices.get(v.id);
      const avail = stock.get(v.id)?.available ?? 0;
      if (avail > 0) anyAvailable = true;
      if (!price) continue;
      if (priceFrom === null || price.unitPrice < priceFrom) {
        priceFrom = price.unitPrice;
        baseFrom = price.basePrice;
      }
      if (price.discountPercent > maxDiscount) maxDiscount = price.discountPercent;
    }

    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      brand: p.brand,
      category: p.categories[0]?.category ?? null,
      image: p.media[0]?.url ?? null,
      imageAlt: p.media[0]?.alt ?? null,
      priceFrom,
      basePriceFrom: baseFrom,
      discountPercent: maxDiscount,
      onSale: maxDiscount > 0,
      inStock: anyAvailable,
      isFeatured: p.isFeatured,
    };
  }

  /** Derives colour/size axes from variants that actually exist and are priced. */
  private buildOptionAxes(
    variants: Array<{
      id: string;
      color: { id: string; displayName: string; slug: string; hexCode: string } | null;
      size: { id: string; label: string; sortOrder: number; numericValue: number | null } | null;
    }>,
    prices: Map<string, unknown>,
    stock: Map<string, { available: number }>,
  ) {
    const colors = new Map<string, { id: string; displayName: string; slug: string; hexCode: string; hasStock: boolean }>();
    const sizes = new Map<string, { id: string; label: string; sortOrder: number; hasStock: boolean }>();

    for (const v of variants) {
      if (!prices.has(v.id)) continue; // unpriced variants are not offerable
      const available = (stock.get(v.id)?.available ?? 0) > 0;
      if (v.color) {
        const existing = colors.get(v.color.id);
        colors.set(v.color.id, {
          id: v.color.id,
          displayName: v.color.displayName,
          slug: v.color.slug,
          hexCode: v.color.hexCode,
          hasStock: (existing?.hasStock ?? false) || available,
        });
      }
      if (v.size) {
        const existing = sizes.get(v.size.id);
        sizes.set(v.size.id, {
          id: v.size.id,
          label: v.size.label,
          sortOrder: v.size.sortOrder,
          hasStock: (existing?.hasStock ?? false) || available,
        });
      }
    }

    return {
      colors: [...colors.values()],
      sizes: [...sizes.values()].sort((a, b) => a.sortOrder - b.sortOrder),
    };
  }
}
