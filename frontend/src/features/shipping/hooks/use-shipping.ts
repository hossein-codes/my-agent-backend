"use client";

import { useQuery } from "@tanstack/react-query";
import { shippingApi, type ShippingQuoteParams } from "../api/shipping-api";
import { queryKeys } from "@/constants";

export function useShippingMethods(params: ShippingQuoteParams, enabled = true) {
  return useQuery({
    queryKey: queryKeys.shipping.methods(
      params.province ?? "",
      params.subtotal ?? 0,
    ),
    queryFn: () => shippingApi.methods(params),
    enabled,
    staleTime: 60_000,
  });
}

export function useProvinces() {
  return useQuery({
    queryKey: queryKeys.shipping.provinces,
    queryFn: shippingApi.provinces,
    staleTime: 10 * 60_000,
  });
}
