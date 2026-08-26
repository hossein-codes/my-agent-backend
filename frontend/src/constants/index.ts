/**
 * App-wide constants. These are presentation/config values; no business
 * rules that belong to the backend (prices, stock, discounts) live here.
 */

export const CURRENCY = "IRT";
export const CURRENCY_LABEL = "تومان";

/** Store brand — shown in the search placeholder and other brand moments. */
export const BRAND_NAME = "LUMINA";

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** Product detail image carousel. */
export const PRODUCT_GALLERY_PEEK = 0;

export const API_REVALIDATE = {
  catalog: 60, // public catalog lists revalidate after 60s
  product: 30,
  static: 600,
} as const;

/** Query keys shared across features (TanStack Query). */
export const queryKeys = {
  catalog: {
    highlights: ["catalog", "highlights"] as const,
    products: (filters: unknown) => ["catalog", "products", filters] as const,
    product: (slug: string) => ["catalog", "product", slug] as const,
    categories: ["catalog", "categories"] as const,
    facets: ["catalog", "facets"] as const,
    brands: ["catalog", "brands"] as const,
    suggest: (q: string) => ["catalog", "suggest", q] as const,
  },
  cart: ["cart"] as const,
  wishlist: ["wishlist"] as const,
  orders: {
    list: (status?: string) => ["orders", "list", status] as const,
    detail: (id: string) => ["orders", "detail", id] as const,
  },
  shipping: {
    methods: (province: string, subtotal: number) =>
      ["shipping", "methods", province, subtotal] as const,
    provinces: ["shipping", "provinces"] as const,
  },
} as const;
