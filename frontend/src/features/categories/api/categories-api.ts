import { apiClient } from "@/lib/api";
import type { Brand, Category, Collection, Facets } from "@/types/domain";
import { mockApi } from "@/mocks/server-data";

export const categoriesApi = {
  async tree(): Promise<Category[]> {
    if (mockApi.isEnabled()) {
      const mocked = mockApi.categories();
      if (mocked) return mocked;
    }
    return apiClient.get<Category[]>("/catalog/categories");
  },
  brands() {
    return apiClient.get<Brand[]>("/catalog/brands");
  },
  async collections(): Promise<Collection[]> {
    if (mockApi.isEnabled()) {
      const mocked = mockApi.collections();
      if (mocked) return mocked;
    }
    return apiClient.get<Collection[]>("/catalog/collections");
  },
  async facets(): Promise<Facets> {
    if (mockApi.isEnabled()) {
      const mocked = mockApi.facets();
      if (mocked) return mocked;
    }
    return apiClient.get<Facets>("/catalog/facets");
  },
};
