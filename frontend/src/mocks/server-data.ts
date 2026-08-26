import {
  MOCK_BRANDS,
  MOCK_CAMPAIGNS,
  MOCK_CATEGORIES,
  MOCK_COLLECTIONS,
  MOCK_FACETS,
  getProduct,
  listProducts,
  suggest,
} from "./data";
import type {
  ActiveCampaign,
  Brand,
  Category,
  Collection,
  Facets,
  ProductDetail,
  ProductListResponse,
  SearchSuggestions,
} from "@/types/domain";

/**
 * Demo mode — the storefront runs entirely on local sample data, no backend.
 *
 * Opt-in via `NEXT_PUBLIC_API_MOCKING=enabled`, so an ordinary build is
 * untouched. It deliberately no longer requires `NODE_ENV === "development"`:
 * publishing the frontend as a standalone showcase is a legitimate use, and
 * gating the data on dev builds made that impossible (a production build
 * rendered an empty storefront).
 *
 * The flag is a compile-time constant, so with it off the bundler can drop the
 * data import entirely. This module is safe to import from Client Components
 * (it does not use `server-only`).
 */
const MOCKING = process.env.NEXT_PUBLIC_API_MOCKING === "enabled";

export const isMocking = MOCKING;

interface MockListArgs {
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
}

export const mockApi = {
  isEnabled(): boolean {
    return MOCKING;
  },

  listProducts(args: MockListArgs = {}): ProductListResponse | null {
    if (!MOCKING) return null;
    return listProducts(args);
  },

  getProduct(slug: string): ProductDetail | null {
    if (!MOCKING) return null;
    return getProduct(slug);
  },

  categories(): Category[] | null {
    if (!MOCKING) return null;
    return MOCK_CATEGORIES;
  },

  campaigns(): ActiveCampaign[] | null {
    if (!MOCKING) return null;
    return MOCK_CAMPAIGNS;
  },

  brands(): Brand[] | null {
    if (!MOCKING) return null;
    return MOCK_BRANDS;
  },

  collections(): Collection[] | null {
    if (!MOCKING) return null;
    return MOCK_COLLECTIONS;
  },

  facets(): Facets | null {
    if (!MOCKING) return null;
    return MOCK_FACETS;
  },

  suggest(term: string): SearchSuggestions | null {
    if (!MOCKING) return null;
    return suggest(term);
  },
};
