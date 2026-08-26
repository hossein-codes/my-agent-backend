"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Lock,
  ShoppingBag,
  Tag,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { PriceDisplay } from "@/components/shared/price-display";
import { ProductImage } from "@/components/shared/product-image";
import { QuantitySelector } from "@/components/shared/quantity-selector";
import { useCart, useCartMutations, cartApi } from "@/features/cart";
import { useAuth } from "@/features/auth";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/constants";
import { ApiError } from "@/lib/api";
import { FreeShippingProgress } from "@/features/cart/components/cart-free-shipping-bar";
import { colorNameFa } from "@/lib/utils/format";

export default function CartPage() {
  const { isAuthenticated, status } = useAuth();
  const { data: cart, isPending, isError, error, refetch } = useCart(isAuthenticated);
  const { updateItem, removeItem } = useCartMutations();
  const qc = useQueryClient();

  const [coupon, setCoupon] = React.useState("");
  const [appliedCoupon, setAppliedCoupon] = React.useState<{ code: string; discount: number } | null>(null);
  const [couponPending, setCouponPending] = React.useState(false);

  const items = cart?.items ?? [];
  const subtotal = cart?.totals.subtotal ?? 0;

  const onQuantityChange = (variantId: string, quantity: number) => {
    updateItem.mutate(
      { variantId, quantity },
      {
        onError: () =>
          toast.error("موجودی این محصول تغییر کرده است. سبد به‌روزرسانی شد."),
      },
    );
  };

  const applyCoupon = async () => {
    const code = coupon.trim().toUpperCase();
    if (!code) return;
    setCouponPending(true);
    try {
      const res = await cartApi.validateCoupon(code);
      setAppliedCoupon({ code: res.code, discount: res.discount });
      toast.success(`کد تخفیف ${res.code} اعمال شد.`);
    } catch (err) {
      setAppliedCoupon(null);
      if (err instanceof ApiError) {
        if (err.code === "coupons.not_found" || err.code === "common.not_found")
          toast.error("چنین کد تخفیفی وجود ندارد.");
        else if (err.code === "coupons.expired") toast.error("این کد تخفیف منقضی شده است.");
        else if (err.code === "coupons.usage_limit_reached")
          toast.error("ظرفیت استفاده از این کد پر شده است.");
        else if (err.code === "coupons.min_order_not_met")
          toast.error("مبلغ سبد برای این کد تخفیف کافی نیست.");
        else toast.error("اعمال کد تخفیف ممکن نشد.");
      } else {
        toast.error("اعمال کد تخفیف ممکن نشد.");
      }
    } finally {
      setCouponPending(false);
      void qc.invalidateQueries({ queryKey: queryKeys.cart });
    }
  };

  if (status === "loading") {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-7 w-32" />
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <EmptyState
        icon={<Lock className="size-7" aria-hidden />}
        title="برای مشاهده سبد خرید وارد شوید."
        description="سبد خرید شما پس از ورود در دسترس است."
        action={
          <Button asChild className="rounded-full px-6">
            <Link href="/login?next=/cart">ورود / ثبت‌نام</Link>
          </Button>
        }
        className="py-24"
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-8">
      <div className="flex items-center justify-between px-4 pt-2">
        <h1 className="text-lg font-extrabold tracking-tight">سبد خرید</h1>
        {items.length > 0 ? (
          <span className="font-nums text-xs text-muted-foreground">
            {items.length.toLocaleString("fa-IR")} قلم کالا
          </span>
        ) : null}
      </div>

      {isPending ? (
        <div className="space-y-3 px-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState
          error={error}
          title="دریافت سبد خرید با مشکل مواجه شد."
          onRetry={() => void refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<ShoppingBag className="size-7" aria-hidden />}
          title="سبد خرید شما خالی است."
          description="از میان محصولات لومینا انتخاب کنید."
          action={
            <Button asChild className="rounded-full px-6">
              <Link href="/products">رفتن به فروشگاه</Link>
            </Button>
          }
          className="py-24"
        />
      ) : (
        <>
          <div className="px-4">
            <FreeShippingProgress subtotal={subtotal} />
          </div>

          <ul className="space-y-3 px-4">
            {items.map((item) => (
              <li
                key={item.variantId}
                className="flex gap-3 rounded-2xl border border-border/60 bg-surface p-3"
              >
                <Link
                  href={item.product?.slug ? `/products/${item.product.slug}` : "/products"}
                  className="shrink-0"
                >
                  <ProductImage
                    src={null}
                    alt={item.product?.name ?? "تصویر محصول"}
                    width={72}
                    height={96}
                    className="h-24 w-[72px] rounded-xl"
                  />
                </Link>
                <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-bold leading-5">
                      {item.product?.name ?? "محصول"}
                    </p>
                    {(item.color || item.size) && (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {[colorNameFa(item.color), item.size].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    {item.available !== undefined && item.available <= 3 ? (
                      <p className="font-nums mt-0.5 text-[10px] text-orange-600">
                        تنها {item.available.toLocaleString("fa-IR")} عدد در انبار
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <QuantitySelector
                      value={item.quantity}
                      min={1}
                      max={Math.max(1, item.available ?? 10)}
                      onChange={(q) => onQuantityChange(item.variantId, q)}
                      disabled={updateItem.isPending && updateItem.variables?.variantId === item.variantId}
                    />
                    <div className="flex flex-col items-end">
                      <PriceDisplay value={item.lineTotal} className="text-sm font-bold" />
                      {item.unitPrice !== null && item.quantity > 1 ? (
                        <PriceDisplay value={item.unitPrice} muted size="sm" className="text-[10px]" />
                      ) : null}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={`حذف ${item.product?.name ?? "محصول"}`}
                  onClick={() =>
                    removeItem.mutate(item.variantId, {
                      onSuccess: () => toast.success("از سبد حذف شد."),
                    })
                  }
                  className="self-start rounded-full p-1.5 text-muted-foreground active:bg-muted active:text-red-500"
                >
                  <Trash2 className="size-[18px]" aria-hidden />
                </button>
              </li>
            ))}
          </ul>

          {/* Coupon */}
          <div className="px-4">
            <div className="rounded-2xl border border-border/60 bg-surface p-3.5">
              <label htmlFor="coupon" className="mb-2 flex items-center gap-1.5 text-xs font-bold">
                <Tag className="size-4 text-accent" aria-hidden />
                کد تخفیف
              </label>
              {appliedCoupon ? (
                <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2.5 text-xs text-emerald-700">
                  <span className="font-nums font-bold" dir="ltr">
                    {appliedCoupon.code}
                  </span>
                  <span className="font-nums">
                    −{appliedCoupon.discount.toLocaleString("fa-IR")} تومان
                  </span>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    id="coupon"
                    value={coupon}
                    onChange={(e) => setCoupon(e.target.value)}
                    placeholder="مثلاً WELCOME10"
                    dir="ltr"
                    className="min-h-11 text-start"
                    autoComplete="off"
                  />
                  <Button
                    variant="outline"
                    className="min-h-11 shrink-0 rounded-xl px-4"
                    onClick={() => void applyCoupon()}
                    disabled={couponPending || !coupon.trim()}
                  >
                    {couponPending ? "…" : "اعمال"}
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Summary */}
          <div className="px-4">
            <div className="space-y-2.5 rounded-2xl border border-border/60 bg-surface p-4">
              <h2 className="text-[13px] font-bold">خلاصه سفارش</h2>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">قیمت کالاها</span>
                <PriceDisplay value={subtotal} size="sm" />
              </div>
              {appliedCoupon ? (
                <div className="flex items-center justify-between text-xs text-emerald-600">
                  <span>تخفیف کد</span>
                  <PriceDisplay value={-appliedCoupon.discount} size="sm" />
                </div>
              ) : null}
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">هزینه ارسال</span>
                <span className="text-muted-foreground">در مرحله بعد</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">مبلغ قابل پرداخت</span>
                <PriceDisplay
                  value={Math.max(0, subtotal - (appliedCoupon?.discount ?? 0))}
                  size="lg"
                  className="text-base font-extrabold"
                />
              </div>
              <p className="text-[10px] leading-4 text-muted-foreground">
                مبلغ نهایی پس از انتخاب روش ارسال و در درگاه پرداخت تعیین می‌شود.
              </p>
            </div>
          </div>

          <div className="px-4">
            <Button asChild className="h-12 w-full rounded-full text-[15px] font-bold">
              <Link
                href={
                  appliedCoupon
                    ? `/checkout?coupon=${encodeURIComponent(appliedCoupon.code)}`
                    : "/checkout"
                }
              >
                ادامه فرایند خرید
                <ArrowLeft className="size-5" aria-hidden />
              </Link>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
