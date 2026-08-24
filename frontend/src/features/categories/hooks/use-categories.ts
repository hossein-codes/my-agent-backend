"use client";

import { useQuery } from "@tanstack/react-query";
import { categoriesApi } from "../api/categories-api";
import { queryKeys } from "@/constants";

export function useCategoryTree() {
  return useQuery({
    queryKey: queryKeys.catalog.categories,
    queryFn: () => categoriesApi.tree(),
    staleTime: 5 * 60_000,
  });
}

export function useFacets() {
  return useQuery({
    queryKey: queryKeys.catalog.facets,
    queryFn: categoriesApi.facets,
    staleTime: 5 * 60_000,
  });
}

export function useBrands() {
  return useQuery({
    queryKey: queryKeys.catalog.brands,
    queryFn: categoriesApi.brands,
    staleTime: 5 * 60_000,
  });
}
