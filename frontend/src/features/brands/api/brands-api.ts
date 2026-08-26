import { apiClient } from "@/lib/api";
import type { Brand } from "@/types/domain";

/**
 * Feature-owned brand API. Routes are relative to the /api/v1 base URL
 * configured in the central client.
 */
export const brandsApi = {
  list() {
    return apiClient.get<Brand[]>("/catalog/brands");
  },
};
