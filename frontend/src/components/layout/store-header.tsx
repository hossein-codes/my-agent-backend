"use client";

import { ShoppingBag } from "lucide-react";
import { useCart } from "@/features/cart";
import { useAuth } from "@/features/auth";
import { HeaderIconButton, CountBadge } from "./header-icon-button";
import { SearchEntry } from "./search-entry";

/**
 * Compact mobile commerce header. One calm row: the search trigger (the
 * primary action, most of the width) + the cart with a subtle count badge.
 * Wishlist/profile/notifications live in the bottom navigation and account
 * area so this row never gets crowded.
 *
 * Sticky behavior is handled by the store layout, which pins the promo bar
 * and this header together as one block.
 */
export function StoreHeader() {
  const { isAuthenticated } = useAuth();
  // Server cart requires auth — a logged-out fetch is a guaranteed 401.
  const { data: cart } = useCart(isAuthenticated);
  const cartCount =
    cart?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;

  return (
    <header className="border-b border-border/70 bg-background/95 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-2.5 px-3 pb-3 pt-2.5">
        <SearchEntry className="min-w-0 flex-1" />
        <HeaderIconButton
          href="/cart"
          label="سبد خرید"
          badge={cartCount > 0 ? <CountBadge count={cartCount} /> : null}
        >
          <ShoppingBag className="size-[22px]" strokeWidth={2} />
        </HeaderIconButton>
      </div>
    </header>
  );
}
