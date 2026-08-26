"use client";

import Link from "next/link";
import { ChevronLeft, Phone, ShieldCheck, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { useAuth, useCurrentUser } from "@/features/auth/hooks/use-auth";

export default function ProfilePage() {
  const { isAuthenticated, status } = useAuth();
  const { data: me } = useCurrentUser(isAuthenticated);

  if (status === "loading")
    return <div className="p-4"><Skeleton className="h-40 w-full rounded-2xl" /></div>;

  if (!isAuthenticated) {
    return (
      <EmptyState
        icon={<User className="size-7" aria-hidden />}
        title="برای مشاهده پروفایل وارد شوید."
        action={
          <Button asChild className="rounded-full px-6">
            <Link href="/login?next=/account/profile">ورود / ثبت‌نام</Link>
          </Button>
        }
        className="py-24"
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-8">
      <div className="flex items-center gap-2 px-4 pt-2">
        <h1 className="text-lg font-extrabold tracking-tight">اطلاعات حساب</h1>
      </div>

      <section className="mx-4 rounded-2xl border border-border/60 bg-surface p-4">
        <h2 className="mb-3 text-[13px] font-bold">مشخصات</h2>
        <dl className="space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">نام و نام خانوادگی</dt>
            <dd className="font-medium">
              {[me?.profile?.firstName, me?.profile?.lastName].filter(Boolean).join(" ") || "—"}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">تاریخ عضویت</dt>
            <dd className="font-nums font-medium">
              {me ? new Date(me.createdAt).toLocaleDateString("fa-IR") : "—"}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">تأیید هویت</dt>
            <dd className={me?.identityVerified ? "font-bold text-emerald-600" : "text-muted-foreground"}>
              {me?.identityVerified ? "تأیید شده" : "تأیید نشده"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="mx-4 rounded-2xl border border-border/60 bg-surface p-4">
        <h2 className="mb-3 flex items-center gap-1.5 text-[13px] font-bold">
          <Phone className="size-4 text-accent" aria-hidden />
          شماره‌های موبایل
        </h2>
        <ul className="space-y-2.5">
          {(me?.phones ?? []).map((p) => (
            <li key={p.id} className="flex items-center justify-between text-xs">
              <span className="font-nums font-medium" dir="ltr">
                {p.phone}
              </span>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                {p.isPrimary ? <span className="font-bold text-accent">اصلی</span> : null}
                {p.verifiedAt ? (
                  <span className="flex items-center gap-0.5 text-emerald-600">
                    <ShieldCheck className="size-3.5" aria-hidden />
                    تأیید شده
                  </span>
                ) : null}
              </span>
            </li>
          ))}
          {me && me.phones.length === 0 ? (
            <li className="text-xs text-muted-foreground">شماره‌ای ثبت نشده است.</li>
          ) : null}
        </ul>
      </section>

      <div className="mx-4">
        <Button asChild variant="outline" className="h-11 w-full rounded-full">
          <Link href="/account">
            <ChevronLeft className="size-5" aria-hidden />
            بازگشت به حساب
          </Link>
        </Button>
      </div>
    </div>
  );
}
