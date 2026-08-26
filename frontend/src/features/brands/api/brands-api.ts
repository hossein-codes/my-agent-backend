import { apiClient } from "@/lib/api";
import type { Brand } from "@/types/domain";
import { mockApi } from "@/mocks/server-data";

/**
 * Feature-owned brand API. Routes are relative to the /api/v1 base URL
 * configured in the central client.
 */
export const brandsApi = {
  async list(): Promise<Brand[]> {
    // Same dev fallback as products/categories/campaigns: with
    // NEXT_PUBLIC_API_MOCKING=enabled the brand rail renders from mock data
    // instead of failing while no backend is running.
    if (mockApi.isEnabled()) {
      const mocked = mockApi.brands();
      if (mocked) return mocked;
    }
    return apiClient.get<Brand[]>("/catalog/brands");
  },
};
