"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ordersApi, type OrderListQuery } from "../api/orders-api";
import { queryKeys } from "@/constants";

export function useOrders(query: OrderListQuery = {}) {
  return useQuery({
    queryKey: queryKeys.orders.list(query.status),
    queryFn: () => ordersApi.list(query),
  });
}

export function useOrder(id: string | null) {
  return useQuery({
    queryKey: queryKeys.orders.detail(id ?? ""),
    queryFn: () => ordersApi.get(id as string),
    enabled: Boolean(id),
  });
}

export function useCancelOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      ordersApi.cancel(id, reason),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["orders"] }),
  });
}
