"use client";

import Link from "next/link";
import { ChevronLeft, Lock, PackageSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { PriceDisplay } from "@/components/shared/price-display";
import { StatusChip } from "@/components/shared/status-chip";
import { useAuth } from "@/features/auth";
import { useOrders } from "@/features/orders/hooks/use-orders";
import { orderStatusLabel } from "@/features/orders/utils/order-status";

export default function OrdersPage() {
  const { isAuthenticated, status } = useAuth();
  const { data, isPending, isError, error, refetch } = useOrders(
    isAuthenticated ? {} : { page: 1 },
  );

  if (status === "loading")
    return <div className="space-y-3 p-4"><Skeleton className="h-7 w-40" /><Skeleton className="h-28 w-full rounded-2xl" /></div>;

  if (!isAuthenticated) {
    return (
      <EmptyState
        icon={<Lock className="size-7" aria-hidden />}
        title="برای مشاهده سفارش‌ها وارد شوید."
        action={
          <Button asChild className="rounded-full px-6">
            <Link href="/login?next=/account/orders">ورود / ثبت‌نام</Link>
          </Button>
        }
        className="py-24"
      />
    );
  }

  const items = data?.items ?? [];

  return (
    <div className="flex flex-col gap-4 pb-8">
      <div className="px-4 pt-2">
        <h1 className="text-lg font-extrabold tracking-tight">سفارش‌های من</h1>
      </div>

      {isPending ? (
        <div className="space-y-3 px-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-2xl" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState error={error} title="دریافت سفارش‌ها با مشکل مواجه شد." onRetry={() => void refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<PackageSearch className="size-7" aria-hidden />}
          title="هنوز سفارشی ثبت نکرده‌اید."
          description="اولین خرید خود را از لومینا انجام دهید."
          action={
            <Button asChild className="rounded-full px-6">
              <Link href="/products">شروع خرید</Link>
            </Button>
          }
          className="py-24"
        />
      ) : (
        <ul className="space-y-3 px-4">
          {items.map((order) => (
            <li key={order.id}>
              <Link
                href={`/orders/${order.id}`}
                className="block rounded-2xl border border-border/60 bg-surface p-4 active:bg-surface-hover"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-nums text-xs font-bold" dir="ltr">
                    {order.orderNumber}
                  </span>
                  <StatusChip status={order.status} label={orderStatusLabel(order.status)} />
                </div>
                <p className="font-nums mt-2 text-[11px] text-muted-foreground">
                  {new Date(order.placedAt).toLocaleDateString("fa-IR", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs text-muted-foreground">
                      {order.preview
                        .slice(0, 2)
                        .map((p) => p.productName)
                        .join("، ")}
                      {order.preview.length > 2 ? " و…" : ""}
                    </p>
                    <PriceDisplay
                      value={order.totalAmount}
                      size="sm"
                      className="mt-1 font-extrabold"
                    />
                  </div>
                  <ChevronLeft className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
