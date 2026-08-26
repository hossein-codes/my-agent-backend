import { apiClient } from "@/lib/api";
import type { SearchSuggestions } from "@/types/domain";
import { mockApi } from "@/mocks/server-data";

export const searchApi = {
  async suggest(term: string): Promise<SearchSuggestions> {
    if (mockApi.isEnabled()) {
      const mocked = mockApi.suggest(term);
      if (mocked) return mocked;
    }
    return apiClient.get<SearchSuggestions>("/catalog/search/suggest", {
      query: { q: term },
    });
  },
};
