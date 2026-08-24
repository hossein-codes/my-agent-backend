"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback } from "react";
import { cartApi } from "../api/cart-api";
import { queryKeys } from "@/constants";
import type { Cart } from "@/types/domain";

export function useCart(enabled = true) {
  return useQuery({
    queryKey: queryKeys.cart,
    queryFn: cartApi.get,
    enabled,
    // Keep the sticky cart bar responsive; don't refocus-refetch.
    staleTime: 30_000,
  });
}

function setCartData(
  qc: ReturnType<typeof useQueryClient>,
  updater: (cart: Cart | undefined) => Cart,
) {
  qc.setQueryData<Cart>(queryKeys.cart, (prev) => updater(prev));
}

export function useCartMutations() {
  const qc = useQueryClient();

  const invalidate = useCallback(() => {
    void qc.invalidateQueries({ queryKey: queryKeys.cart });
  }, [qc]);

  const addItem = useMutation({
    mutationFn: cartApi.addItem,
    // Optimistic: server returns the authoritative cart; no client math.
    onSuccess: (cart) => setCartData(qc, () => cart),
    onError: invalidate,
  });

  const updateItem = useMutation({
    mutationFn: ({
      variantId,
      quantity,
    }: {
      variantId: string;
      quantity: number;
    }) => cartApi.updateItem(variantId, { quantity }),
    onSuccess: (cart) => setCartData(qc, () => cart),
    onError: invalidate,
  });

  const removeItem = useMutation({
    mutationFn: (variantId: string) => cartApi.removeItem(variantId),
    onSuccess: (cart) => setCartData(qc, () => cart),
    onError: invalidate,
  });

  return { addItem, updateItem, removeItem, invalidate };
}

/** Derived cart count for the badge. Reads from the cached server cart. */
export function useCartCount(): number {
  const { data } = useCart();
  if (!data) return 0;
  return data.items.reduce((sum, item) => sum + item.quantity, 0);
}
