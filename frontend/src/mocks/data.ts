/**
 * DEV-ONLY sample data for local UI work without a running backend.
 *
 * Shapes MUST mirror the real backend responses in src/types/domain.ts — these
 * are not production types. Nothing in this file is imported by production code;
 * it is only reachable through src/mocks/handlers.ts when
 * NEXT_PUBLIC_API_MOCKING=enabled.
 */

import type {
  ActiveCampaign,
  Brand,
  Category,
  Collection,
  FacetColor,
  Facets,
  FacetSize,
  ProductDetail,
  ProductListItem,
  ProductListResponse,
  SearchSuggestion,
  SearchSuggestions,
} from "@/types/domain";

export interface MockProduct extends ProductListItem {
  description: string;
  variants: ProductDetail["variants"];
  options: ProductDetail["options"];
  attributes: ProductDetail["attributes"];
}

function img(name: string): string {
  return `/mock/${name}`;
}

export const MOCK_CATEGORIES: Category[] = [
  {
    id: "c-women",
    name: "زنانه",
    slug: "women",
    path: "women",
    productCount: 128,
    children: [
      {
        id: "c-tops",
        name: "بلوز و تی‌شرت",
        slug: "tops",
        path: "women.tops",
        productCount: 42,
        children: [],
      },
      {
        id: "c-dresses",
        name: "لباس مجلسی",
        slug: "dresses",
        path: "women.dresses",
        productCount: 24,
        children: [],
      },
    ],
  },
  {
    id: "c-men",
    name: "مردانه",
    slug: "men",
    path: "men",
    productCount: 96,
    children: [
      {
        id: "c-shirts",
        name: "پیراهن",
        slug: "shirts",
        path: "men.shirts",
        productCount: 30,
        children: [],
      },
      {
        id: "c-jeans",
        name: "جین",
        slug: "jeans",
        path: "men.jeans",
        productCount: 20,
        children: [],
      },
    ],
  },
  {
    id: "c-shoes",
    name: "کفش",
    slug: "shoes",
    path: "shoes",
    productCount: 64,
    children: [
      {
        id: "c-sneakers",
        name: "کتانی",
        slug: "sneakers",
        path: "shoes.sneakers",
        productCount: 28,
        children: [],
      },
      {
        id: "c-boots",
        name: "بوت",
        slug: "boots",
        path: "shoes.boots",
        productCount: 12,
        children: [],
      },
    ],
  },
  {
    id: "c-bags",
    name: "کیف",
    slug: "bags",
    path: "bags",
    productCount: 48,
    children: [],
  },
  {
    id: "c-accessories",
    name: "اکسسوری",
    slug: "accessories",
    path: "accessories",
    productCount: 72,
    children: [
      {
        id: "c-watches",
        name: "ساعت",
        slug: "watches",
        path: "accessories.watches",
        productCount: 18,
        children: [],
      },
      {
        id: "c-fragrance",
        name: "عطر",
        slug: "fragrance",
        path: "accessories.fragrance",
        productCount: 14,
        children: [],
      },
    ],
  },
  {
    id: "c-new",
    name: "تازه‌ها",
    slug: "new",
    path: "new",
    productCount: 36,
    children: [],
  },
];

const brand = (name: string, slug: string) => ({ name, slug });

/**
 * Small palette so the colour/size filters have something real to filter on.
 * Variants are derived from it deterministically (see `makeVariants`).
 */
const COLOR_PALETTE = [
  { id: "col-black", name: "مشکی", hex: "#0b0b10" },
  { id: "col-navy", name: "سرمه‌ای", hex: "#1b2a4a" },
  { id: "col-cream", name: "کرم", hex: "#e8ddc9" },
  { id: "col-olive", name: "زیتونی", hex: "#6b7043" },
];

const SIZE_SET = ["S", "M", "L", "XL"];

/**
 * Three colours x two sizes per product, picked by the product's index so every
 * product differs but the data is stable between renders. Stock varies too, so
 * the "only in stock" filter has something to do.
 */
function makeVariants(seed = 0): ProductDetail["variants"] {
  const variants: ProductDetail["variants"] = [];
  for (let c = 0; c < 3; c++) {
    const {
      id: colorId,
      name: colorName,
      hex: colorHex,
    } = COLOR_PALETTE[(seed + c) % COLOR_PALETTE.length] ?? {
      id: "col-black",
      name: "مشکی",
      hex: "#0b0b10",
    };
    for (let sz = 0; sz < 2; sz++) {
      const size = SIZE_SET[(seed + c + sz) % SIZE_SET.length] ?? "M";
      const available =
        (seed + c * 2 + sz) % 4 === 0 ? 0 : 3 + ((seed + c + sz) % 6);
      variants.push({
        id: `v-${seed}-${c}-${sz}`,
        sku: `SKU-${seed}${c}${sz}`,
        colorId,
        color: colorName,
        colorHex,
        sizeId: `sz-${size.toLowerCase()}`,
        size,
        price: { base: 0, sale: 0, unit: 0, discountPercent: 0, onSale: false },
        available,
        purchasable: available > 0,
      });
    }
  }
  return variants;
}

export const MOCK_PRODUCTS: MockProduct[] = [
  {
    id: "p1",
    name: "تی‌شرت نخی یقه‌گرد مشکی",
    slug: "black-crew-tee",
    brand: brand("LUMINA", "lumina"),
    category: { name: "زنانه", slug: "women" },
    image: img("p-black-tee.jpg"),
    imageAlt: "تی‌شرت نخی مشکی",
    priceFrom: 890000,
    basePriceFrom: 1150000,
    discountPercent: 23,
    onSale: true,
    inStock: true,
    isFeatured: true,
    description: "تی‌شرتی با برش مینیمال از نخ پنبهٔ صد در صد.",
    variants: makeVariants(0),
    options: { colors: [], sizes: [] },
    attributes: [],
  },
  {
    id: "p2",
    name: "جین راست‌پا نیلی تیره",
    slug: "dark-slim-jeans",
    brand: brand("LUMINA", "lumina"),
    category: { name: "مردانه", slug: "men" },
    image: img("p-denim.jpg"),
    imageAlt: "جین نیلی",
    priceFrom: 1650000,
    basePriceFrom: 1650000,
    discountPercent: 0,
    onSale: false,
    inStock: true,
    isFeatured: true,
    description: "جین راست‌پا با دوام و راحتی روزمره.",
    variants: makeVariants(1),
    options: { colors: [], sizes: [] },
    attributes: [],
  },
  {
    id: "p3",
    name: "بافت کرم یقه‌گرد",
    slug: "cream-knit-sweater",
    brand: brand("ATELIER", "atelier"),
    category: { name: "زنانه", slug: "women" },
    image: img("p-knit.jpg"),
    imageAlt: "بافت کرم",
    priceFrom: 1290000,
    basePriceFrom: 1590000,
    discountPercent: 19,
    onSale: true,
    inStock: true,
    isFeatured: true,
    description: "بافتی نرم و گرم برای روزهای سرد.",
    variants: makeVariants(2),
    options: { colors: [], sizes: [] },
    attributes: [],
  },
  {
    id: "p4",
    name: "بوت چرم مشکی",
    slug: "black-leather-boots",
    brand: brand("LUMINA", "lumina"),
    category: { name: "کفش", slug: "shoes" },
    image: img("p-boots.jpg"),
    imageAlt: "بوت چرم مشکی",
    priceFrom: 2850000,
    basePriceFrom: 3400000,
    discountPercent: 16,
    onSale: true,
    inStock: true,
    isFeatured: true,
    description: "بوت چرم طبیعی با زیرهٔ راحت.",
    variants: makeVariants(3),
    options: { colors: [], sizes: [] },
    attributes: [],
  },
  {
    id: "p5",
    name: "کیف دستی ساختاریافته مشکی",
    slug: "structured-black-bag",
    brand: brand("MAISON", "maison"),
    category: { name: "کیف", slug: "bags" },
    image: img("p-bag.jpg"),
    imageAlt: "کیف مشکی",
    priceFrom: 3200000,
    basePriceFrom: 3200000,
    discountPercent: 0,
    onSale: false,
    inStock: true,
    isFeatured: false,
    description: "کیف دستی کلاسیک با دوخت دقیق.",
    variants: makeVariants(4),
    options: { colors: [], sizes: [] },
    attributes: [],
  },
  {
    id: "p6",
    name: "ساعت کلاسیک بند چرم",
    slug: "classic-leather-watch",
    brand: brand("CHRONO", "chrono"),
    category: { name: "اکسسوری", slug: "accessories" },
    image: img("p-watch.jpg"),
    imageAlt: "ساعت کلاسیک",
    priceFrom: 4500000,
    basePriceFrom: 4500000,
    discountPercent: 0,
    onSale: false,
    inStock: true,
    isFeatured: true,
    description: "ساعت مینیمال با صفحهٔ گرد و بند چرم.",
    variants: makeVariants(5),
    options: { colors: [], sizes: [] },
    attributes: [],
  },
  {
    id: "p7",
    name: "کتانی سفید مینیمال",
    slug: "minimal-white-sneakers",
    brand: brand("LUMINA", "lumina"),
    category: { name: "کفش", slug: "shoes" },
    image: img("p-sneakers.jpg"),
    imageAlt: "کتانی سفید",
    priceFrom: 1980000,
    basePriceFrom: 2400000,
    discountPercent: 18,
    onSale: true,
    inStock: true,
    isFeatured: false,
    description: "کتانی سبک برای استفادهٔ روزانه.",
    variants: makeVariants(6),
    options: { colors: [], sizes: [] },
    attributes: [],
  },
  {
    id: "p8",
    name: "بلیزر تک‌دکمهٔ زغالی",
    slug: "charcoal-blazer",
    brand: brand("ATELIER", "atelier"),
    category: { name: "زنانه", slug: "women" },
    image: img("p-jacket.jpg"),
    imageAlt: "بلیزر زغالی",
    priceFrom: 3600000,
    basePriceFrom: 3600000,
    discountPercent: 0,
    onSale: false,
    inStock: true,
    isFeatured: false,
    description: "بلیزر ساختاریافته برای استایل رسمی.",
    variants: makeVariants(7),
    options: { colors: [], sizes: [] },
    attributes: [],
  },
  {
    id: "p9",
    name: "لباس مجلسی مشکی",
    slug: "black-evening-dress",
    brand: brand("MAISON", "maison"),
    category: { name: "زنانه", slug: "women" },
    image: img("p-dress.jpg"),
    imageAlt: "لباس مجلسی",
    priceFrom: 5200000,
    basePriceFrom: 6500000,
    discountPercent: 20,
    onSale: true,
    inStock: true,
    isFeatured: false,
    description: "لباس شب با برش ظریف و پارچهٔ لوکس.",
    variants: makeVariants(8),
    options: { colors: [], sizes: [] },
    attributes: [],
  },
];

const now = new Date();
const inDays = (d: number) =>
  new Date(now.getTime() + d * 86_400_000).toISOString();

export const MOCK_CAMPAIGNS: ActiveCampaign[] = [
  {
    id: "cmp-flash",
    name: "فروش ویژه ۴۸ ساعته",
    slug: "flash-sale",
    description: "تا ۳۰٪ تخفیف روی منتخب فصل",
    startsAt: inDays(-2),
    endsAt: inDays(2),
  },
  {
    id: "cmp-fw",
    name: "کالکشن پاییز",
    slug: "fw-collection",
    description: "تازه‌های فصل",
    startsAt: inDays(-10),
    endsAt: inDays(20),
  },
];

/**
 * Brands for `/catalog/brands`, derived from the mock catalog so the brand rail
 * always matches the products rendered next to it. The full `Brand` shape
 * (id/logoUrl/productCount) is what the backend returns; list items only carry
 * `{name, slug}`, which is why this is built separately.
 */
export const MOCK_BRANDS: Brand[] = (() => {
  const bySlug = new Map<
    string,
    { name: string; slug: string; count: number }
  >();
  for (const product of MOCK_PRODUCTS) {
    if (!product.brand) continue;
    const entry = bySlug.get(product.brand.slug) ?? {
      ...product.brand,
      count: 0,
    };
    entry.count += 1;
    bySlug.set(product.brand.slug, entry);
  }
  return [...bySlug.values()].map((b) => ({
    id: `br-${b.slug}`,
    name: b.name,
    slug: b.slug,
    logoUrl: null,
    productCount: b.count,
  }));
})();

/**
 * Facets for the filter sheet, derived from the variants above so labels can
 * never drift from the products they filter.
 */
export const MOCK_FACETS: Facets = (() => {
  const colors = new Map<string, FacetColor>();
  const sizes = new Map<string, FacetSize>();
  for (const product of MOCK_PRODUCTS) {
    for (const variant of product.variants) {
      if (variant.colorId && variant.color && !colors.has(variant.colorId)) {
        colors.set(variant.colorId, {
          id: variant.colorId,
          name: variant.color,
          displayName: variant.color,
          slug: variant.colorId.replace(/^col-/, ""),
          hexCode: variant.colorHex ?? "#000000",
        });
      }
      if (variant.sizeId && variant.size && !sizes.has(variant.sizeId)) {
        sizes.set(variant.sizeId, {
          id: variant.sizeId,
          label: variant.size,
          type: "APPAREL",
          slug: variant.sizeId.replace(/^sz-/, ""),
        });
      }
    }
  }
  return {
    colors: [...colors.values()],
    sizes: [...sizes.values()],
    attributes: [],
  };
})();

export const MOCK_COLLECTIONS: Collection[] = [
  {
    id: "cll-fw",
    name: "کالکشن پاییز",
    slug: "fw-collection",
    description: "تازه‌های فصل",
    imageUrl: null,
  },
  {
    id: "cll-essentials",
    name: "ضروریات کمد",
    slug: "essentials",
    description: "پایه‌های همیشگی",
    imageUrl: null,
  },
  {
    id: "cll-evening",
    name: "مجلسی شب",
    slug: "evening",
    description: "برای مناسبت‌ها",
    imageUrl: null,
  },
];

/** Search suggestions across products and categories, like `/catalog/search/suggest`. */
export function suggest(term: string): SearchSuggestions {
  const q = term.trim().toLowerCase();
  if (!q) return { items: [] };
  const items: SearchSuggestion[] = [];
  for (const product of MOCK_PRODUCTS) {
    if (
      product.name.toLowerCase().includes(q) ||
      product.description.toLowerCase().includes(q)
    ) {
      items.push({
        type: "PRODUCT",
        label: product.name,
        href: `/products/${product.slug}`,
      });
    }
  }
  for (const category of MOCK_CATEGORIES) {
    for (const node of [category, ...(category.children ?? [])]) {
      if (node.name.toLowerCase().includes(q)) {
        items.push({
          type: "CATEGORY",
          label: node.name,
          href: `/categories/${node.slug}`,
        });
      }
    }
  }
  return { items: items.slice(0, 8) };
}

export function listProducts(opts: {
  page?: number;
  pageSize?: number;
  sort?: string;
  onSale?: boolean;
  featured?: boolean;
  category?: string;
  search?: string;
  brands?: string[];
  colors?: string[];
  sizes?: string[];
  inStock?: boolean;
}): ProductListResponse {
  let items = [...MOCK_PRODUCTS];
  if (opts.onSale) items = items.filter((p) => p.onSale);
  if (opts.featured) items = items.filter((p) => p.isFeatured);
  if (opts.inStock) items = items.filter((p) => p.inStock);
  if (opts.category)
    items = items.filter((p) => p.category?.slug === opts.category);
  if (opts.brands?.length)
    items = items.filter((p) => p.brand && opts.brands!.includes(p.brand.slug));
  if (opts.colors?.length)
    items = items.filter((p) =>
      p.variants.some((v) => v.color && opts.colors!.includes(v.color)),
    );
  if (opts.sizes?.length)
    items = items.filter((p) =>
      // Sizes are matched by LABEL, exactly like the real API.
      p.variants.some((v) => v.size && opts.sizes!.includes(v.size)),
    );
  if (opts.search) {
    const q = opts.search.trim().toLowerCase();
    if (q)
      items = items.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          (p.brand?.name.toLowerCase().includes(q) ?? false),
      );
  }

  switch (opts.sort) {
    case "price_asc":
      items.sort((a, b) => (a.priceFrom ?? 0) - (b.priceFrom ?? 0));
      break;
    case "price_desc":
      items.sort((a, b) => (b.priceFrom ?? 0) - (a.priceFrom ?? 0));
      break;
    case "popular":
      items.sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured));
      break;
    case "newest":
      items.reverse();
      break;
  }

  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 20;
  const start = (page - 1) * pageSize;
  const slice = items.slice(start, start + pageSize);

  return {
    items: slice,
    total: items.length,
    page,
    pageSize,
  };
}

export function getProduct(slug: string): ProductDetail | null {
  const p = MOCK_PRODUCTS.find((x) => x.slug === slug);
  if (!p) return null;
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    brand: { ...p.brand!, logoUrl: null },
    categories: p.category
      ? [p.category as { name: string; slug: string; path: string }]
      : [],
    collections: [],
    tags: [],
    media: p.image ? [{ url: p.image, alt: p.imageAlt, type: "IMAGE" }] : [],
    attributes: p.attributes,
    options: p.options,
    variants: p.variants,
    priceFrom: p.priceFrom,
    isFeatured: p.isFeatured,
    seo: { title: p.name, description: p.description },
    publishedAt: new Date().toISOString(),
  };
}
