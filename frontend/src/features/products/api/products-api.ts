import { apiClient } from "@/lib/api";
import { DEFAULT_PAGE_SIZE } from "@/constants";
import type { SortKey } from "@/types/domain";
import type { ProductDetail, ProductListResponse } from "@/types/domain";
import { mockApi } from "@/mocks/server-data";

export interface ProductListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  category?: string;
  includeSubcategories?: boolean;
  brands?: string[];
  collection?: string;
  colors?: string[];
  /** Sizes are matched by LABEL (the Size model has no slug). */
  sizes?: string[];
  attrs?: Record<string, string[]>;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  onSale?: boolean;
  featured?: boolean;
  sort?: SortKey;
}

function buildQuery(params: ProductListParams): URLSearchParams {
  const q = new URLSearchParams();
  q.set("page", String(params.page ?? 1));
  q.set("pageSize", String(params.pageSize ?? DEFAULT_PAGE_SIZE));
  if (params.search) q.set("search", params.search);
  if (params.category) q.set("category", params.category);
  if (params.includeSubcategories)
    q.set("includeSubcategories", String(params.includeSubcategories));
  if (params.brands?.length) q.set("brands", params.brands.join(","));
  if (params.collection) q.set("collection", params.collection);
  if (params.colors?.length) q.set("colors", params.colors.join(","));
  if (params.sizes?.length) q.set("sizes", params.sizes.join(","));
  if (params.minPrice !== undefined) q.set("minPrice", String(params.minPrice));
  if (params.maxPrice !== undefined) q.set("maxPrice", String(params.maxPrice));
  if (params.inStock) q.set("inStock", "true");
  if (params.onSale) q.set("onSale", "true");
  if (params.featured) q.set("featured", "true");
  if (params.sort) q.set("sort", params.sort);
  if (params.attrs) {
    for (const [key, values] of Object.entries(params.attrs)) {
      if (values?.length) q.set("attrs", `${key}:${values.join("|")}`);
    }
  }
  return q;
}

export const productsApi = {
  async list(params: ProductListParams = {}): Promise<ProductListResponse> {
    if (mockApi.isEnabled()) {
      const mocked = mockApi.listProducts({
        page: params.page,
        pageSize: params.pageSize,
        sort: params.sort,
        onSale: params.onSale,
        featured: params.featured,
        category: params.category,
        search: params.search,
        brands: params.brands,
        colors: params.colors,
        sizes: params.sizes,
        inStock: params.inStock,
      });
      if (mocked) return mocked;
    }
    const query = Object.fromEntries(buildQuery(params).entries());
    return apiClient.get<ProductListResponse>("/catalog/products", {
      query: query as Record<string, string>,
    });
  },

  async getBySlug(slug: string): Promise<ProductDetail> {
    if (mockApi.isEnabled()) {
      const mocked = mockApi.getProduct(slug);
      if (mocked) return mocked;
    }
    return apiClient.get<ProductDetail>(`/catalog/products/${slug}`);
  },
};
