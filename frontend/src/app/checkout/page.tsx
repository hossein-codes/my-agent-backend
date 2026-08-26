"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  Lock,
  MapPin,
  ShoppingBag,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { PriceDisplay } from "@/components/shared/price-display";
import { useAuth } from "@/features/auth";
import { useCart } from "@/features/cart";
import { useSavedAddresses } from "@/features/addresses";
import {
  useCheckoutPreview,
  useSubmitOrder,
  useInitiatePayment,
} from "@/features/checkout/hooks/use-checkout";
import {
  AddressForm,
  EMPTY_ADDRESS,
  validateAddress,
} from "@/features/checkout/components/address-form";
import type { AddressFormValues } from "@/features/checkout/schemas/checkout-schema";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils/cn";
import { toPersianDigits } from "@/lib/utils/format";

export default function CheckoutPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const couponFromUrl = sp.get("coupon") ?? undefined;
  const { isAuthenticated, status, user } = useAuth();
  const { data: cart, isPending: cartPending } = useCart(isAuthenticated);
  const { mutateAsync: submitOrder, isPending: submitting } = useSubmitOrder();
  const { mutateAsync: initiatePayment } = useInitiatePayment();

  const [address, setAddress] = React.useState<AddressFormValues>(EMPTY_ADDRESS);
  const [errors, setErrors] = React.useState<Partial<Record<keyof AddressFormValues, string>>>({});
  const [shippingMethodId, setShippingMethodId] = React.useState<string>("");
  const [placed, setPlaced] = React.useState(false);

  const preview = useCheckoutPreview(
    {
      provinceName: address.provinceName,
      couponCode: couponFromUrl,
    },
    Boolean(address.provinceName),
  );

  // One-time prefill from the account phone + local address book, applied
  // during render (React's recommended pattern — no effect cascades).
  const { addresses: savedAddresses } = useSavedAddresses();
  const [prefill, setPrefill] = React.useState<AddressFormValues | null>(null);
  const prefillSource = React.useMemo(
    () => savedAddresses[0] ?? null,
    [savedAddresses],
  );
  if (prefill === null && (prefillSource || user?.phones?.[0]?.phone)) {
    const base: AddressFormValues = { ...EMPTY_ADDRESS };
    const first = prefillSource;
    if (first) {
      for (const [k, v] of Object.entries(first)) {
        if (k === "id" || k === "label") continue;
        if (v) (base as Record<string, unknown>)[k] = v;
      }
    }
    base.receiverPhone = base.receiverPhone || user?.phones?.[0]?.phone || "";
    setPrefill(base);
    setAddress((a) => (a === EMPTY_ADDRESS ? base : a));
  }

  const items = cart?.items ?? [];
  const shippingOptions = React.useMemo(
    () => preview.data?.shippingOptions ?? [],
    [preview.data],
  );
  const totals = preview.data?.totals;
  // Default to the cheapest option until the user picks one explicitly.
  const cheapestId = React.useMemo(
    () =>
      shippingOptions.length
        ? [...shippingOptions].sort((a, b) => a.amount - b.amount)[0]?.methodId ?? ""
        : "",
    [shippingOptions],
  );
  const effectiveShippingId = shippingMethodId || cheapestId;

  if (status === "loading" || cartPending) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-64 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <EmptyState
        icon={<Lock className="size-7" aria-hidden />}
        title="برای تکمیل خرید وارد شوید."
        action={
          <Button asChild className="rounded-full px-6">
            <Link href="/login?next=/checkout">ورود / ثبت‌نام</Link>
          </Button>
        }
        className="py-24"
      />
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingBag className="size-7" aria-hidden />}
        title="سبد خرید شما خالی است."
        description="برای تسویه حساب ابتدا محصولی به سبد اضافه کنید."
        action={
          <Button asChild className="rounded-full px-6">
            <Link href="/products">رفتن به فروشگاه</Link>
          </Button>
        }
        className="py-24"
      />
    );
  }

  const pay = async () => {
    const addrErrors = validateAddress(address);
    setErrors(addrErrors);
    if (Object.keys(addrErrors).length > 0) {
      toast.error("لطفاً خطاهای فرم آدرس را برطرف کنید.");
      window.scrollTo({ top: 0 });
      return;
    }
    if (!effectiveShippingId) {
      toast.error("روش ارسال را انتخاب کنید.");
      return;
    }
    try {
      const order = await submitOrder({ ...address, shippingMethodId: effectiveShippingId, couponCode: couponFromUrl });
      setPlaced(true);
      const payment = await initiatePayment(order.orderId);
      if (payment.gatewayUrl) {
        window.location.href = payment.gatewayUrl;
      } else {
        // No gateway (direct settlement) — go straight to the result.
        router.push(`/payment-result?status=payment-success&order=${encodeURIComponent(order.orderNumber)}`);
      }
    } catch (err) {
      setPlaced(false);
      if (err instanceof ApiError) {
        switch (err.code) {
          case "inventory.out_of_stock":
            toast.error("موجودی یکی از محصولات تغییر کرده است. سبد را بررسی کنید.");
            break;
          case "orders.payment_window":
            toast.error("ثبت سفارش ممکن نشد. دوباره تلاش کنید.");
            break;
          case "common.validation_error":
            toast.error("اطلاعات آدرس یا سفارش کامل نیست.");
            break;
          default:
            toast.error("ثبت سفارش انجام نشد. دوباره تلاش کنید.");
        }
      } else {
        toast.error("ثبت سفارش انجام نشد. اتصال خود را بررسی کنید.");
      }
    }
  };

  return (
    <div className="flex flex-col gap-5 pb-32">
      <div className="px-4 pt-2">
        <h1 className="text-lg font-extrabold tracking-tight">تسویه حساب</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          مراحل را کامل کنید و پرداخت را انجام دهید.
        </p>
      </div>

      {/* Steps indicator */}
      <ol className="flex items-center justify-between gap-1 px-4" aria-label="مراحل خرید">
        {["آدرس", "ارسال", "پرداخت"].map((label, i) => (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                "font-nums flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                i === 0
                  ? "bg-accent text-accent-foreground"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {toPersianDigits(i + 1)}
            </span>
            <span className={cn("text-[11px]", i === 0 ? "font-bold" : "text-muted-foreground")}>
              {label}
            </span>
            {i < 2 ? <span className="h-px flex-1 bg-border" aria-hidden /> : null}
          </li>
        ))}
      </ol>

      {/* Address */}
      <section className="mx-4 rounded-2xl border border-border/60 bg-surface p-4">
        <h2 className="mb-3 flex items-center gap-1.5 text-[13px] font-bold">
          <MapPin className="size-4 text-accent" aria-hidden />
          آدرس تحویل سفارش
        </h2>
        <AddressForm
          value={address}
          onChange={setAddress}
          errors={errors}
          defaultPhone={user?.phones?.[0]?.phone}
        />
      </section>

      {/* Shipping */}
      <section className="mx-4 rounded-2xl border border-border/60 bg-surface p-4">
        <h2 className="mb-3 flex items-center gap-1.5 text-[13px] font-bold">
          <Truck className="size-4 text-accent" aria-hidden />
          روش ارسال
        </h2>
        {!address.provinceName ? (
          <p className="text-xs leading-6 text-muted-foreground">
            ابتدا استان را در فرم آدرس انتخاب کنید تا روش‌های ارسال و هزینه آن نمایش داده شود.
          </p>
        ) : preview.isPending ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : shippingOptions.length === 0 ? (
          <p className="text-xs leading-6 text-muted-foreground">
            برای این استان روش ارسالی ثبت نشده است.
          </p>
        ) : (
          <ul className="space-y-2">
            {shippingOptions.map((opt) => (
              <li key={opt.methodId}>
                <label
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 transition-colors",
                    effectiveShippingId === opt.methodId
                      ? "border-accent bg-accent/5"
                      : "border-border active:bg-muted/50",
                  )}
                >
                  <span className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="shipping"
                      className="size-4 accent-[var(--accent)]"
                      checked={effectiveShippingId === opt.methodId}
                      onChange={() => setShippingMethodId(opt.methodId)}
                    />
                    <span>
                      <span className="block text-[13px] font-bold">{opt.name}</span>
                      {opt.estimatedDaysMin ? (
                        <span className="font-nums block text-[11px] text-muted-foreground">
                          تحویل {toPersianDigits(opt.estimatedDaysMin)}
                          {opt.estimatedDaysMax && opt.estimatedDaysMax !== opt.estimatedDaysMin
                            ? ` تا ${toPersianDigits(opt.estimatedDaysMax)}`
                            : ""}{" "}
                          روزه
                        </span>
                      ) : null}
                    </span>
                  </span>
                  {opt.freeShippingApplied || opt.amount === 0 ? (
                    <span className="text-xs font-bold text-emerald-600">ارسال رایگان</span>
                  ) : (
                    <PriceDisplay value={opt.amount} size="sm" className="font-bold" />
                  )}
                </label>
              </li>
            ))}
          </ul>
        )}
        {preview.data?.couponError ? (
          <p className="mt-2 text-[11px] text-orange-600">{preview.data.couponError}</p>
        ) : null}
      </section>

      {/* Payment */}
      <section className="mx-4 rounded-2xl border border-border/60 bg-surface p-4">
        <h2 className="mb-2 flex items-center gap-1.5 text-[13px] font-bold">
          <CreditCard className="size-4 text-accent" aria-hidden />
          پرداخت
        </h2>
        <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 p-3">
          <span className="text-[13px] font-medium">پرداخت اینترنتی (درگاه امن)</span>
          <CheckCircle2 className="size-5 text-accent" aria-hidden />
        </div>
        <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
          پس از ثبت سفارش به درگاه پرداخت منتقل می‌شوید و پس از پرداخت به‌صورت خودکار به لومینا برمی‌گردید.
        </p>
      </section>

      {/* Summary */}
      <section className="mx-4 rounded-2xl border border-border/60 bg-surface p-4">
        <h2 className="mb-3 text-[13px] font-bold">خلاصه پرداخت</h2>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">قیمت کالاها ({toPersianDigits(items.length)} قلم)</span>
            <PriceDisplay value={totals?.subtotal ?? cart?.totals.subtotal ?? 0} size="sm" />
          </div>
          {totals && totals.couponDiscount > 0 ? (
            <div className="flex justify-between text-emerald-600">
              <span>تخفیف</span>
              <PriceDisplay value={-totals.couponDiscount} size="sm" />
            </div>
          ) : null}
          <div className="flex justify-between">
            <span className="text-muted-foreground">هزینه ارسال</span>
            {totals ? (
              <PriceDisplay value={totals.shippingFrom} size="sm" />
            ) : (
              <span className="text-muted-foreground">پس از انتخاب استان</span>
            )}
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold">مبلغ قابل پرداخت</span>
            <PriceDisplay
              value={totals?.total ?? cart?.totals.subtotal ?? 0}
              size="lg"
              className="text-base font-extrabold"
            />
          </div>
          <p className="text-[10px] leading-4 text-muted-foreground">
            مبلغ نهایی در درگاه پرداخت، مطابق همین عدد است؛ اگر تفاوتی دیدید پرداخت را انجام ندهید.
          </p>
        </div>
      </section>

      {/* Sticky pay CTA */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/95 p-3 pb-[calc(var(--sab)+0.75rem)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-md items-center gap-3">
          <div className="min-w-0 shrink-0">
            <span className="block text-[10px] text-muted-foreground">مبلغ قابل پرداخت</span>
            <PriceDisplay
              value={totals?.total ?? cart?.totals.subtotal ?? 0}
              className="text-base font-extrabold"
            />
          </div>
          <Button
            className="h-12 flex-1 rounded-full text-[15px] font-bold"
            onClick={() => void pay()}
            disabled={submitting || placed}
          >
            {submitting || placed ? (
              <>
                <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
                در حال ثبت…
              </>
            ) : (
              <>
                پرداخت و ثبت سفارش
                <ArrowLeft className="size-5" aria-hidden />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
