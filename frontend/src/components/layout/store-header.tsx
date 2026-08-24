"use client";

import { Bell, Heart, ShoppingBag } from "lucide-react";
import { useCart } from "@/features/cart";
import { useWishlist } from "@/features/wishlist";
import { useAuth } from "@/features/auth";
import { HeaderIconButton, CountBadge } from "./header-icon-button";
import { LuminaLogo } from "./lumina-logo";
import { SearchEntry } from "./search-entry";

/**
 * Premium mobile header: a top action bar with a TRUE centered logo (3-column
 * grid so unequal side groups never shift it) + a search entry below.
 * Safe-area aware. The top row uses a fixed height and centers its content so
 * badges/groups never inflate it or push the logo off-center.
 */
export function StoreHeader() {
  const { data: cart } = useCart();
  const { isAuthenticated } = useAuth();
  const { data: wishlist } = useWishlist(1, isAuthenticated);

  const cartCount =
    cart?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
  const wishlistCount = isAuthenticated ? (wishlist?.total ?? 0) : 0;

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 pt-safe backdrop-blur-xl">
      <div className="mx-auto w-full max-w-5xl px-3">
        {/* Top bar — fixed height, vertically centered, 3 equal columns. */}
        <div className="grid h-14 grid-cols-3 items-center">
          <div className="flex h-full min-w-0 items-center justify-start">
            <HeaderIconButton href="/notifications" label="اعلان‌ها">
              <Bell className="size-[22px]" strokeWidth={2} />
            </HeaderIconButton>
          </div>

          <div className="flex h-full min-w-0 items-center justify-center">
            <LuminaLogo />
          </div>

          <div className="flex h-full min-w-0 items-center justify-end">
            <HeaderIconButton
              href={isAuthenticated ? "/wishlist" : "/login"}
              label="علاقه‌مندی‌ها"
              badge={
                wishlistCount > 0 ? <CountBadge count={wishlistCount} /> : null
              }
            >
              <Heart className="size-[22px]" strokeWidth={2} />
            </HeaderIconButton>
            <HeaderIconButton
              href="/cart"
              label="سبد خرید"
              badge={cartCount > 0 ? <CountBadge count={cartCount} /> : null}
            >
              <ShoppingBag className="size-[22px]" strokeWidth={2} />
            </HeaderIconButton>
          </div>
        </div>

        {/* Search entry — part of the sticky header */}
        <div className="pb-3">
          <SearchEntry />
        </div>
      </div>
    </header>
  );
}
