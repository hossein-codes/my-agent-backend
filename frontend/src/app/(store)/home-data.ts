import "server-only";
import { productsApi } from "@/features/products";
import { categoriesApi } from "@/features/categories";
import { campaignsApi } from "@/features/campaigns";
import { brandsApi } from "@/features/brands";
import type {
  ActiveCampaign,
  Brand,
  Category,
  ProductListItem,
} from "@/types/domain";

/**
 * Server-side data composition for the Home page. Each section fetches
 * independently and failures degrade section-by-section so a single endpoint
 * being down never destroys the whole page. No endpoint is invented: these are
 * all real backend routes (/catalog/*, /campaigns/active).
 */
export interface HomeData {
  categories: Category[];
  featured: ProductListItem[];
  onSale: ProductListItem[];
  newest: ProductListItem[];
  campaigns: ActiveCampaign[];
  brands: Brand[];
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    // Rich but safe diagnostics: error name, ApiError code/status, cause —
    // never headers/tokens. The api client already logged the URL.
    const e = err as { name?: string; code?: string; status?: number; message?: string };
    console.error(
      `[home-data] section fetch failed: ${e.name ?? "Error"}` +
        `${e.code ? ` [${e.code}${e.status ? "/" + e.status : ""}]` : ""}: ${e.message}`,
    );
    return fallback;
  }
}

export async function getHomeData(): Promise<HomeData> {
  const [categories, featuredRes, onSaleRes, newestRes, campaigns, brands] =
    await Promise.all([
      safe(() => categoriesApi.tree(), [] as Category[]),
      safe(
        () => productsApi.list({ sort: "popular", pageSize: 10 }),
        { items: [] as ProductListItem[], total: 0, page: 1, pageSize: 10 },
      ),
      safe(
        () =>
          productsApi.list({
            onSale: true,
            sort: "price_asc",
            pageSize: 12,
          }),
        { items: [] as ProductListItem[], total: 0, page: 1, pageSize: 12 },
      ),
      safe(
        () => productsApi.list({ sort: "newest", pageSize: 10 }),
        { items: [] as ProductListItem[], total: 0, page: 1, pageSize: 10 },
      ),
      safe(() => campaignsApi.active(), [] as ActiveCampaign[]),
      safe(() => brandsApi.list(), [] as Brand[]),
    ]);

  return {
    categories,
    featured: featuredRes.items,
    onSale: onSaleRes.items,
    newest: newestRes.items,
    campaigns,
    brands,
  };
}
