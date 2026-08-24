"use client";

import { useQuery } from "@tanstack/react-query";
import { productsApi, type ProductListParams } from "../api/products-api";
import { queryKeys } from "@/constants";

export function useProducts(params: ProductListParams) {
  return useQuery({
    queryKey: queryKeys.catalog.products(params),
    queryFn: () => productsApi.list(params),
    placeholderData: (prev) => prev,
  });
}

export function useProduct(slug: string | null) {
  return useQuery({
    queryKey: queryKeys.catalog.product(slug ?? ""),
    queryFn: () => productsApi.getBySlug(slug as string),
    enabled: Boolean(slug),
  });
}
