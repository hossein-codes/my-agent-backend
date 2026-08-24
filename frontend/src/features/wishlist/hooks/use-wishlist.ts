"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { wishlistApi } from "../api/wishlist-api";
import { queryKeys } from "@/constants";

export function useWishlist(page = 1, enabled = true) {
  return useQuery({
    queryKey: [...queryKeys.wishlist, page],
    queryFn: () => wishlistApi.list({ page }),
    enabled,
  });
}

/** Tracks wishlist membership as a Set of productIds (from the first page). */
export function useWishlistIds(): Set<string> {
  const { data } = useWishlist(1);
  return new Set((data?.items ?? []).map((i) => i.productId));
}

export function useWishlistMutations() {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: queryKeys.wishlist });

  const add = useMutation({
    mutationFn: ({
      productId,
      variantId,
    }: {
      productId: string;
      variantId?: string;
    }) => wishlistApi.add(productId, variantId),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (productId: string) => wishlistApi.remove(productId),
    onSuccess: invalidate,
  });

  return { add, remove };
}
