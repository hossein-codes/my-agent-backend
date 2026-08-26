"use client";

import * as React from "react";
import Link from "next/link";
import { Heart, Lock, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { PriceDisplay } from "@/components/shared/price-display";
import { ProductImage } from "@/components/shared/product-image";
import { useWishlist, useWishlistMutations } from "@/features/wishlist";
import { useAuth } from "@/features/auth";
import { cn } from "@/lib/utils/cn";

export default function WishlistPage() {
  const { isAuthenticated, status } = useAuth();
  const { data, isPending, isError, error, refetch } = useWishlist(1, isAuthenticated);
  const { remove } = useWishlistMutations();

  const items = data?.items ?? [];

  if (status === "loading") {
    return <div className="space-y-3 p-4"><Skeleton className="h-7 w-32" /><Skeleton className="h-28 w-full rounded-2xl" /></div>;
  }

  if (!isAuthenticated) {
    return (
      <EmptyState
        icon={<Lock className="size-7" aria-hidden />}
        title="برای مشاهده علاقه‌مندی‌ها وارد شوید."
        action={
          <Button asChild className="rounded-full px-6">
            <Link href="/login?next=/wishlist">ورود / ثبت‌نام</Link>
          </Button>
        }
        className="py-24"
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-8">
      <div className="px-4 pt-2">
        <h1 className="text-lg font-extrabold tracking-tight">علاقه‌مندی‌های من</h1>
        {items.length > 0 ? (
          <p className="font-nums mt-1 text-xs text-muted-foreground">
            {items.length.toLocaleString("fa-IR")} محصول ذخیره شده
          </p>
        ) : null}
      </div>

      {isPending ? (
        <div className="space-y-3 px-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState error={error} title="دریافت علاقه‌مندی‌ها با مشکل مواجه شد." onRetry={() => void refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Heart className="size-7" aria-hidden />}
          title="هنوز محصولی به علاقه‌مندی‌ها اضافه نکرده‌اید."
          description="با لمس آیکن قلب روی هر محصول، آن را برای بعد ذخیره کنید."
          action={
            <Button asChild className="rounded-full px-6">
              <Link href="/products">مشاهده محصولات</Link>
            </Button>
          }
          className="py-24"
        />
      ) : (
        <ul className="space-y-3 px-4">
          {items.map((item) => {
            const outOfStock = item.available !== null && item.available <= 0;
            return (
              <li
                key={item.productId}
                className="flex items-center gap-3 rounded-2xl border border-border/60 bg-surface p-3"
              >
                <Link href={`/products/${item.slug}`} className="shrink-0">
                  <ProductImage
                    src={null}
                    alt={item.name}
                    width={72}
                    height={96}
                    className="h-24 w-[72px] rounded-xl"
                  />
                </Link>
                <div className="flex min-w-0 flex-1 flex-col justify-between self-stretch gap-1.5 py-0.5">
                  <Link href={`/products/${item.slug}`} className="min-w-0">
                    <p className="truncate text-[13px] font-bold leading-5">{item.name}</p>
                  </Link>
                  <div className="flex items-center justify-between gap-2">
                    {item.price ? (
                      <PriceDisplay
                        value={item.price.sale ?? item.price.base}
                        size="sm"
                        className="font-bold"
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-bold",
                        outOfStock ? "bg-red-50 text-red-500" : "bg-emerald-50 text-emerald-600",
                      )}
                    >
                      {outOfStock ? "ناموجود" : "موجود"}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-center gap-1 self-stretch">
                  <Link
                    href={`/products/${item.slug}`}
                    aria-label={`خرید ${item.name}`}
                    className="flex size-11 items-center justify-center rounded-full bg-accent/10 text-accent active:bg-accent/20"
                  >
                    <ShoppingBag className="size-5" aria-hidden />
                  </Link>
                  <button
                    type="button"
                    aria-label={`حذف ${item.name}`}
                    onClick={() =>
                      remove.mutate(item.productId, {
                        onSuccess: () => toast.success("از علاقه‌مندی‌ها حذف شد."),
                      })
                    }
                    className="flex size-11 items-center justify-center rounded-full text-muted-foreground active:bg-muted active:text-red-500"
                  >
                    <Heart className="size-5" fill="currentColor" aria-hidden />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
