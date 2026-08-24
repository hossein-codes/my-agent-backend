import { apiClient } from "@/lib/api";
import type { SearchSuggestions } from "@/types/domain";

export const searchApi = {
  suggest(term: string) {
    return apiClient.get<SearchSuggestions>("/catalog/search/suggest", {
      query: { q: term },
    });
  },
};
