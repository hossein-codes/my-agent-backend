"use client";

import { useQuery } from "@tanstack/react-query";
import { productsApi } from "@/features/products";
import { queryKeys } from "@/constants";

/**
 * Product results for the search overlay. Shares the catalog cache with the
 * listing page (same queryKeys), so opening the overlay after browsing a
 * matching list is instant.
 */
export function useSearchProducts(term: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.catalog.products({ search: term, pageSize: 10, page: 1 }),
    queryFn: () => productsApi.list({ search: term, pageSize: 10, sort: "popular" }),
    enabled: enabled && term.trim().length >= 2,
    staleTime: 30_000,
  });
}
