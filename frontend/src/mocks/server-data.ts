import {
  MOCK_CAMPAIGNS,
  MOCK_CATEGORIES,
  getProduct,
  listProducts,
} from "./data";
import type {
  ActiveCampaign,
  Category,
  ProductDetail,
  ProductListResponse,
} from "@/types/domain";

/**
 * DEV-ONLY in-memory backend for local UI work.
 *
 * Returns data shaped exactly like the real backend. The mock flag
 * (NEXT_PUBLIC_API_MOCKING) is read at the server boundary so feature APIs
 * fall back to these values when no backend is running. Because `MOCKING` is a
 * compile-time constant (false in production), the data import is tree-shaken
 * out of production bundles. This module is intentionally safe to import from
 * Client Components (it does not use `server-only`).
 */
const MOCKING =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_API_MOCKING === "enabled";

export const isMocking = MOCKING;

interface MockListArgs {
  page?: number;
  pageSize?: number;
  sort?: string;
  onSale?: boolean;
  featured?: boolean;
  category?: string;
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
};
