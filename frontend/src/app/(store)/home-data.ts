import "server-only";
import { productsApi } from "@/features/products";
import { categoriesApi } from "@/features/categories";
import { campaignsApi } from "@/features/campaigns";
import type {
  ActiveCampaign,
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
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error("[home-data] section fetch failed:", (err as Error)?.message);
    return fallback;
  }
}

export async function getHomeData(): Promise<HomeData> {
  const [categories, featuredRes, onSaleRes, newestRes, campaigns] =
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
    ]);

  return {
    categories,
    featured: featuredRes.items,
    onSale: onSaleRes.items,
    newest: newestRes.items,
    campaigns,
  };
}
