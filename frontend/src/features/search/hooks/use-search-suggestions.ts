"use client";

import { useQuery } from "@tanstack/react-query";
import { searchApi } from "../api/search-api";
import { queryKeys } from "@/constants";

const MIN_CHARS = 2;

/** Debounced typeahead. Enabled only when there are ≥ 2 characters. */
export function useSearchSuggestions(term: string, enabled = true) {
  const q = term.trim();
  return useQuery({
    queryKey: queryKeys.catalog.suggest(q),
    queryFn: () => searchApi.suggest(q),
    enabled: enabled && q.length >= MIN_CHARS,
    staleTime: 30_000,
  });
}
