"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { queryKeys } from "@/constants";
import type { Facets } from "@/types/domain";

/** Catalog facets (colors / sizes / attributes) for the filter sheet. */
export function useFacets(enabled = true) {
  return useQuery({
    queryKey: queryKeys.catalog.facets,
    queryFn: () => apiClient.get<Facets>("/catalog/facets"),
    enabled,
    staleTime: 5 * 60_000,
  });
}
