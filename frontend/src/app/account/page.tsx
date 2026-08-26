"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  ChevronLeft,
  Heart,
  LogOut,
  MapPin,
  PackageSearch,
  User,
  UserCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { useAuth, useLogout, useCurrentUser } from "@/features/auth/hooks/use-auth";

const MENU: Array<{ href: string; label: string; icon: typeof PackageSearch }> = [
  { href: "/account/orders", label: "سفارش‌های من", icon: PackageSearch },
  { href: "/wishlist", label: "علاقه‌مندی‌ها", icon: Heart },
  { href: "/account/addresses", label: "آدرس‌های من", icon: MapPin },
  { href: "/notifications", label: "اعلان‌ها", icon: Bell },
  { href: "/account/profile", label: "اطلاعات حساب", icon: UserCircle2 },
];

export default function AccountPage() {
  const router = useRouter();
  const { isAuthenticated, status } = useAuth();
  const logout = useLogout();
  const { data: me } = useCurrentUser(isAuthenticated);

  if (status === "loading") {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-24 w-full rounded-3xl" />
        <Skeleton className="h-64 w-full rounded-3xl" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <EmptyState
        icon={<User className="size-7" aria-hidden />}
        title="وارد حساب خود شوید."
        description="با حساب کاربری می‌توانید سفارش‌ها و علاقه‌مندی‌های خود را ببینید."
        action={
          <Button asChild className="rounded-full px-6">
            <Link href="/login?next=/account">ورود / ثبت‌نام</Link>
          </Button>
        }
        className="py-24"
      />
    );
  }

  const displayName =
    [me?.profile?.firstName, me?.profile?.lastName].filter(Boolean).join(" ") || "کاربر لومینا";
  const phone = me?.phones?.find((p) => p.isPrimary)?.phone ?? me?.phones?.[0]?.phone ?? "";

  return (
    <div className="flex flex-col gap-4 pb-8">
      {/* Profile card */}
      <div className="mx-4 mt-2 flex items-center gap-4 rounded-3xl border border-border/60 bg-surface p-5">
        <span className="flex size-16 items-center justify-center rounded-full bg-accent/10 text-2xl font-black text-accent">
          {(me?.profile?.firstName ?? "ل").slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-extrabold">{displayName}</p>
          {phone ? (
            <p className="font-nums mt-1 text-xs text-muted-foreground" dir="ltr">
              {phone}
            </p>
          ) : null}
        </div>
        <Link
          href="/account/profile"
          aria-label="ویرایش پروفایل"
          className="flex size-11 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </Link>
      </div>

      {/* Menu */}
      <nav className="mx-4 overflow-hidden rounded-3xl border border-border/60 bg-surface" aria-label="حساب کاربری">
        <ul>
          {MENU.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.href} className="border-b border-border/50 last:border-0">
                <Link
                  href={item.href}
                  className="flex min-h-14 items-center gap-3 px-4 text-sm font-medium active:bg-muted/50"
                >
                  <Icon className="size-5 text-muted-foreground" aria-hidden />
                  <span className="flex-1">{item.label}</span>
                  <ChevronLeft className="size-4 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mx-4">
        <Button
          variant="outline"
          className="h-12 w-full rounded-2xl text-red-500"
          onClick={async () => {
            await logout();
            toast.success("از حساب خود خارج شدید.");
            router.push("/");
          }}
        >
          <LogOut className="size-5" aria-hidden />
          خروج از حساب کاربری
        </Button>
      </div>
    </div>
  );
}
