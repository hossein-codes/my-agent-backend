"use client";

import { useMemo } from "react";
import { useCartMutations } from "@/features/cart";
import { useProduct } from "./use-products";
import type { ProductListItem } from "@/types/domain";

/**
 * Quick-add for a product card. The list item carries no variantId, so when the
 * user taps add we load the product detail (cached) and pick the first
 * purchasable variant. Stock and price stay backend-authoritative.
 */
export function useQuickAddToCart(product: ProductListItem) {
  const { data: detail } = useProduct(product.slug);
  const addItem = useCartMutations().addItem;

  const variant = useMemo(
    () => detail?.variants.find((v) => v.purchasable),
    [detail],
  );

  const add = () => {
    if (!variant) return;
    addItem.mutate({ variantId: variant.id, quantity: 1 });
  };

  return {
    add,
    isPending: addItem.isPending,
    canAdd: Boolean(variant),
  };
}

/**
 * Whether a variant of this product is in the cart. Without an exact variant
 * match we do not claim it is (no fake state). The cart badge/count is driven
 * separately from the server cart.
 */
export function useIsProductInCart(_product: ProductListItem): boolean {
  void _product;
  // Exact cart membership requires matching the chosen variantId; the product
  // list item does not expose one, so we never claim the product is in cart.
  return false;
}
