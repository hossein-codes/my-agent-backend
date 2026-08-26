"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowRight, ChevronLeft, CreditCard, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/error-state";
import { PriceDisplay } from "@/components/shared/price-display";
import { StatusChip } from "@/components/shared/status-chip";
import { useOrder, useCancelOrder } from "@/features/orders/hooks/use-orders";
import { useInitiatePayment } from "@/features/checkout/hooks/use-checkout";
import { orderStatusLabel } from "@/features/orders/utils/order-status";
import { ApiError } from "@/lib/api";
import { toPersianDigits } from "@/lib/utils/format";
import type { OrderStatus } from "@/types/domain";

const TIMELINE: Array<{ status: OrderStatus; label: string }> = [
  { status: "PENDING_PAYMENT", label: "ثبت سفارش" },
  { status: "PAID", label: "پرداخت" },
  { status: "PROCESSING", label: "پردازش" },
  { status: "SHIPPED", label: "ارسال" },
  { status: "DELIVERED", label: "تحویل" },
];

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: order, isPending, isError, error, refetch } = useOrder(id ?? null);
  const cancelOrder = useCancelOrder();
  const initiatePayment = useInitiatePayment();

  if (isPending) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }
  if (isError || !order) {
    return (
      <ErrorState
        error={error}
        title="سفارش پیدا نشد."
        description="ممکن است حذف شده یا متعلق به حساب دیگری باشد."
        onRetry={() => void refetch()}
        className="py-20"
      />
    );
  }

  const cancelled = ["CANCELLED", "RETURN_REQUESTED", "RETURNED"].includes(order.status);
  const currentIdx = TIMELINE.findIndex((t) => t.status === order.status);
  const reached = (s: OrderStatus) => {
    if (cancelled) return false;
    const idx = TIMELINE.findIndex((t) => t.status === s);
    if (currentIdx === -1) return ["PAID", "PROCESSING", "READY_TO_SHIP", "SHIPPED", "DELIVERED", "COMPLETED"].includes(s);
    return TIMELINE.indexOf(TIMELINE.find((t) => t.status === s)!) <= currentIdx;
  };

  const payAgain = async () => {
    try {
      const payment = await initiatePayment.mutateAsync(order.id);
      if (payment.gatewayUrl) window.location.href = payment.gatewayUrl;
      else toast.error("درگاه پرداخت در دسترس نیست.");
    } catch {
      toast.error("شروع پرداخت انجام نشد. دوباره تلاش کنید.");
    }
  };

  const cancel = async () => {
    cancelOrder.mutate(
      { id: order.id, reason: "تغییر نظر مشتری" },
      {
        onSuccess: () => toast.success("سفارش لغو شد."),
        onError: (err) =>
          toast.error(
            err instanceof ApiError && err.code === "orders.transition_not_allowed"
              ? "این سفارش در وضعیت فعلی قابل لغو نیست."
              : "لغو سفارش انجام نشد.",
          ),
      },
    );
  };

  return (
    <div className="flex flex-col gap-4 pb-10">
      <div className="flex items-center gap-2 px-4 pt-2">
        <Link
          href="/account/orders"
          aria-label="بازگشت به سفارش‌ها"
          className="flex size-9 items-center justify-center rounded-full border border-border bg-surface active:bg-muted"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </Link>
        <div className="min-w-0">
          <h1 className="font-nums text-base font-extrabold" dir="ltr">
            {order.orderNumber}
          </h1>
          <p className="font-nums text-[11px] text-muted-foreground">
            {new Date(order.dates.placedAt).toLocaleDateString("fa-IR", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
        <StatusChip
          status={order.status}
          label={orderStatusLabel(order.status)}
          className="ms-auto"
        />
      </div>

      {/* Payment CTA */}
      {order.status === "PENDING_PAYMENT" ? (
        <div className="mx-4 flex gap-2">
          <Button className="h-11 flex-1 rounded-full font-bold" onClick={() => void payAgain()} disabled={initiatePayment.isPending}>
            <CreditCard className="size-5" aria-hidden />
            {initiatePayment.isPending ? "در حال انتقال…" : "پرداخت سفارش"}
          </Button>
          <Button
            variant="outline"
            className="h-11 rounded-full text-red-500"
            onClick={() => void cancel()}
            disabled={cancelOrder.isPending}
          >
            <XCircle className="size-5" aria-hidden />
            لغو
          </Button>
        </div>
      ) : null}

      {/* Progress timeline */}
      {!cancelled ? (
        <div className="mx-4 rounded-2xl border border-border/60 bg-surface p-4">
          <ol className="flex items-center">
            {TIMELINE.map((step, i) => {
              const done = reached(step.status);
              return (
                <li key={step.status} className="flex flex-1 flex-col items-center gap-1.5">
                  <div className="flex w-full items-center">
                    {i > 0 ? (
                      <span className={`h-0.5 flex-1 ${reached(TIMELINE[i - 1]!.status) && done ? "bg-accent" : "bg-border"}`} aria-hidden />
                    ) : <span className="h-0.5 flex-1 bg-transparent" aria-hidden />}
                    <span
                      className={`size-3.5 shrink-0 rounded-full ${done ? "bg-accent" : "bg-border"}`}
                      aria-hidden
                    />
                    {i < TIMELINE.length - 1 ? (
                      <span className="h-0.5 flex-1 bg-border" aria-hidden />
                    ) : <span className="h-0.5 flex-1 bg-transparent" aria-hidden />}
                  </div>
                  <span className={`text-[9.5px] leading-3 ${done ? "font-bold text-foreground" : "text-muted-foreground"}`}>
                    {step.label}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}

      {/* Items */}
      <section className="mx-4 rounded-2xl border border-border/60 bg-surface p-4">
        <h2 className="mb-3 text-[13px] font-bold">
          اقلام سفارش ({toPersianDigits(order.items.length)} قلم)
        </h2>
        <ul className="space-y-3">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium leading-5">{item.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {[item.color, item.size].filter(Boolean).join(" · ")}
                  {item.quantity > 1 ? ` · ${toPersianDigits(item.quantity)} عدد` : ""}
                </p>
              </div>
              <PriceDisplay value={item.lineTotal} size="sm" className="shrink-0 font-bold" />
            </li>
          ))}
        </ul>

        <Separator className="my-4" />

        <dl className="space-y-2 text-xs">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">قیمت کالاها</dt>
            <PriceDisplay value={order.totals.subtotal} size="sm" />
          </div>
          {order.totals.productDiscount > 0 ? (
            <div className="flex justify-between text-emerald-600">
              <dt>تخفیف محصول</dt>
              <PriceDisplay value={-order.totals.productDiscount} size="sm" />
            </div>
          ) : null}
          {order.totals.couponDiscount > 0 ? (
            <div className="flex justify-between text-emerald-600">
              <dt>کد تخفیف {order.couponCode ? `(${order.couponCode})` : ""}</dt>
              <PriceDisplay value={-order.totals.couponDiscount} size="sm" />
            </div>
          ) : null}
          <div className="flex justify-between">
            <dt className="text-muted-foreground">هزینه ارسال</dt>
            <PriceDisplay value={order.totals.shipping} size="sm" />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <dt className="text-sm font-bold">مبلغ کل</dt>
            <PriceDisplay value={order.totals.total} size="lg" className="text-base font-extrabold" />
          </div>
        </dl>
      </section>

      {/* Address */}
      {order.address ? (
        <section className="mx-4 rounded-2xl border border-border/60 bg-surface p-4">
          <h2 className="mb-2 text-[13px] font-bold">آدرس تحویل</h2>
          <p className="text-xs leading-6 text-muted-foreground">
            {order.address.receiverFirstName} {order.address.receiverLastName} ·{" "}
            <span className="font-nums" dir="ltr">{order.address.receiverPhone}</span>
            <br />
            {order.address.provinceName}، {order.address.cityName}
            {order.address.district ? `، ${order.address.district}` : ""} — {order.address.line}
            {order.address.unit ? ` · پلاک/واحد ${order.address.unit}` : ""}
          </p>
        </section>
      ) : null}

      <div className="mx-4">
        <Button asChild variant="outline" className="h-11 w-full rounded-full">
          <Link href="/account/orders">
            <ArrowRight className="size-5" aria-hidden />
            بازگشت به سفارش‌ها
          </Link>
        </Button>
      </div>
    </div>
  );
}
