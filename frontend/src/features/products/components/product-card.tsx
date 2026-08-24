"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { ProductImage } from "@/components/shared/product-image";
import { PriceDisplay } from "@/components/shared/price-display";
import { useWishlistIds, useWishlistMutations } from "@/features/wishlist";
import {
  useIsProductInCart,
  useQuickAddToCart,
} from "../hooks/use-quick-add";
import type { ProductListItem } from "@/types/domain";

interface ProductCardProps {
  product: ProductListItem;
  className?: string;
  priority?: boolean;
}

/**
 * Compact, image-first mobile product card used across all product rails
 * (featured, new arrivals, flash sale). One design — sections share it.
 */
export function ProductCard({
  product,
  className,
  priority = false,
}: ProductCardProps) {
  const wishlistIds = useWishlistIds();
  const wished = wishlistIds.has(product.id);
  const { add: addWish, remove: removeWish } = useWishlistMutations();
  const inCart = useIsProductInCart(product);
  const { add, isPending } = useQuickAddToCart(product);

  const toggleWish = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (wished) removeWish.mutate(product.id);
    else addWish.mutate({ productId: product.id });
  };

  return (
    <Link
      href={`/products/${product.slug}`}
      className={cn(
        "group block w-[44vw] min-w-[150px] max-w-[200px] shrink-0",
        "tap-highlight-transparent rounded-2xl",
        className,
      )}
      aria-label={product.name}
    >
      <div className="relative aspect-[3/4] overflow-hidden rounded-2xl border border-border/70 bg-surface">
        <ProductImage
          src={product.image}
          alt={product.imageAlt ?? product.name}
          fill
          priority={priority}
          sizes="(max-width: 480px) 44vw, 200px"
          className="transition-transform duration-300 group-active:scale-[1.03]"
        />

        {/* Discount badge */}
        {product.onSale && product.discountPercent > 0 ? (
          <span className="absolute start-2 top-2 rounded-full bg-accent px-2 py-0.5 font-nums text-[11px] font-bold text-accent-foreground shadow-sm">
            ٪{product.discountPercent.toLocaleString("fa-IR")}
          </span>
        ) : null}

        {/* Wishlist */}
        <button
          type="button"
          onClick={toggleWish}
          aria-pressed={wished}
          aria-label={wished ? "حذف از علاقه‌مندی" : "افزودن به علاقه‌مندی"}
          className={cn(
            "absolute end-2 top-2 flex size-9 items-center justify-center rounded-full backdrop-blur-md transition-all",
            wished
              ? "bg-accent text-accent-foreground"
              : "bg-black/40 text-white/90 active:bg-black/60",
          )}
        >
          <Heart
            className="size-4"
            fill={wished ? "currentColor" : "none"}
          />
        </button>

        {/* Quick add — appears at the bottom when not already in cart */}
        {product.inStock ? (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              add();
            }}
            disabled={isPending}
            className={cn(
              "absolute inset-x-2 bottom-2 rounded-xl py-2 text-xs font-semibold transition-all",
              inCart
                ? "bg-success/90 text-success-foreground"
                : "bg-foreground/95 text-background opacity-0 backdrop-blur group-active:opacity-100",
            )}
          >
            {inCart ? "در سبد شماست" : isPending ? "در حال افزودن…" : "افزودن به سبد"}
          </button>
        ) : (
          <span className="absolute inset-x-2 bottom-2 rounded-xl bg-destructive/85 py-2 text-center text-xs font-semibold text-destructive-foreground">
            ناموجود
          </span>
        )}
      </div>

      <div className="px-1 pt-2.5">
        {product.brand ? (
          <p className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">
            {product.brand.name}
          </p>
        ) : null}
        <h3 className="mt-0.5 line-clamp-2 text-[13px] font-medium leading-6 text-foreground">
          {product.name}
        </h3>
        <div className="mt-1.5 flex items-center gap-2">
          <PriceDisplay
            value={product.priceFrom}
            withCurrency={false}
            size="sm"
            className="font-semibold"
          />
          {product.onSale && product.basePriceFrom ? (
            <PriceDisplay
              value={product.basePriceFrom}
              withCurrency={false}
              muted
              size="sm"
              className="text-[11px] line-through"
            />
          ) : null}
        </div>
      </div>
    </Link>
  );
}
