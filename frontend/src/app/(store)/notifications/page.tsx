"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { useAuth } from "@/features/auth";
import { notificationsApi } from "@/features/notifications";
import { cn } from "@/lib/utils/cn";

const TYPE_ICON: Record<string, string> = {
  ORDER: "🛍️",
  PROMO: "🎁",
  SYSTEM: "🔔",
  STOCK: "📦",
};

export default function NotificationsPage() {
  const { isAuthenticated, status } = useAuth();
  const qc = useQueryClient();
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ["notifications", 1],
    queryFn: () => notificationsApi.list({ page: 1 }),
    enabled: isAuthenticated,
  });

  if (status === "loading") return <div className="p-4"><Skeleton className="h-28 w-full rounded-2xl" /></div>;

  if (!isAuthenticated) {
    return (
      <EmptyState
        icon={<Lock className="size-7" aria-hidden />}
        title="برای مشاهده اعلان‌ها وارد شوید."
        action={
          <Button asChild className="rounded-full px-6">
            <Link href="/login?next=/notifications">ورود / ثبت‌نام</Link>
          </Button>
        }
        className="py-24"
      />
    );
  }

  const items = data?.items ?? [];
  const unread = items.filter((n) => !n.readAt).length;

  const markAll = async () => {
    try {
      await notificationsApi.markAllRead();
      await qc.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("همه اعلان‌ها خوانده شد.");
    } catch {
      toast.error("انجام نشد؛ دوباره تلاش کنید.");
    }
  };

  return (
    <div className="flex flex-col gap-4 pb-8">
      <div className="flex items-center justify-between px-4 pt-2">
        <h1 className="text-lg font-extrabold tracking-tight">اعلان‌ها</h1>
        {unread > 0 ? (
          <button
            type="button"
            onClick={() => void markAll()}
            className="flex min-h-9 items-center gap-1.5 text-xs font-medium text-accent active:opacity-70"
          >
            <CheckCheck className="size-4" aria-hidden />
            خواندن همه
          </button>
        ) : null}
      </div>

      {isPending ? (
        <div className="space-y-2.5 px-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState error={error} title="دریافت اعلان‌ها با مشکل مواجه شد." onRetry={() => void refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Bell className="size-7" aria-hidden />}
          title="اعلانی ندارید."
          description="وضعیت سفارش‌ها و تخفیف‌های ویژه اینجا نمایش داده می‌شود."
          className="py-24"
        />
      ) : (
        <ul className="space-y-2.5 px-4">
          {items.map((n) => (
            <li
              key={n.id}
              className={cn(
                "flex items-start gap-3 rounded-2xl border p-4",
                n.readAt ? "border-border/60 bg-surface" : "border-accent/30 bg-accent/5",
              )}
            >
              <span className="mt-0.5 text-xl" aria-hidden>
                {TYPE_ICON[n.type] ?? "🔔"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold leading-5">{n.title ?? "اعلان"}</p>
                {n.body ? (
                  <p className="mt-1 text-xs leading-6 text-muted-foreground">{n.body}</p>
                ) : null}
                <p className="font-nums mt-1.5 text-[10px] text-muted-foreground">
                  {new Date(n.createdAt).toLocaleString("fa-IR")}
                </p>
              </div>
              {!n.readAt ? <span className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" aria-label="خوانده‌نشده" /> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
