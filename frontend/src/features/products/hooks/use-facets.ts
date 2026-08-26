"use client";

import { useQuery } from "@tanstack/react-query";
import { categoriesApi } from "@/features/categories/api/categories-api";
import { queryKeys } from "@/constants";

/** Catalog facets (colors / sizes / attributes) for the filter sheet. */
export function useFacets(enabled = true) {
  return useQuery({
    queryKey: queryKeys.catalog.facets,
    // Goes through the feature API so demo mode (no backend) is handled once.
    queryFn: () => categoriesApi.facets(),
    enabled,
    staleTime: 5 * 60_000,
  });
}
