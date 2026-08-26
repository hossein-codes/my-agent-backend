"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart, Home, LayoutGrid, ShoppingBag, User } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useCartCount } from "@/features/cart";
import { useAuth } from "@/features/auth";
import { toPersianDigits } from "@/lib/utils/format";

type NavItem = {
  href: string;
  label: string;
  icon: typeof Home;
  /** Requires auth — unauthenticated taps go to login instead. */
  auth?: boolean;
  /** Live count badge (cart). */
  badgeCount?: number;
};

/**
 * Fixed bottom navigation — the five commerce destinations. Safe-area aware,
 * 44px+ touch targets, calm active state (accent color + icon weight + soft
 * pill). Sits below the search overlay (z-40) so search owns the screen when
 * open.
 */
export function MobileNav() {
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();
  const cartCount = useCartCount(isAuthenticated);

  const navItems: NavItem[] = [
    { href: "/", label: "خانه", icon: Home },
    { href: "/categories", label: "دسته‌بندی", icon: LayoutGrid },
    {
      href: "/cart",
      label: "سبد خرید",
      icon: ShoppingBag,
      auth: true,
      badgeCount: cartCount,
    },
    { href: "/wishlist", label: "علاقه‌مندی", icon: Heart, auth: true },
    { href: "/account", label: "پروفایل", icon: User, auth: true },
  ];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[calc(var(--sab)+0.5rem)] pt-2 sm:hidden"
      aria-label="ناوبری اصلی"
    >
      <ul className="mx-auto flex max-w-md items-center justify-around rounded-3xl border border-border/70 bg-card/90 p-1.5 shadow-lg backdrop-blur-xl">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const href =
            item.auth && !isAuthenticated ? `/login?next=${item.href}` : item.href;
          const badge =
            item.badgeCount && item.badgeCount > 0 ? (
              <span
                aria-hidden="true"
                className="font-nums absolute -top-0.5 start-1/2 -translate-x-1/2 rounded-full bg-accent px-1.5 text-[9.5px] font-bold leading-[16px] text-accent-foreground ring-2 ring-card"
              >
                {item.badgeCount > 99 ? "۹۹+" : toPersianDigits(item.badgeCount)}
              </span>
            ) : null;

          return (
            <li key={item.href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                aria-label={item.label}
                className={cn(
                  "tap-highlight-transparent relative flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-1.5 text-[10px] font-medium transition-colors",
                  active
                    ? "bg-accent/12 text-accent"
                    : "text-muted-foreground active:text-foreground",
                )}
              >
                <span className="relative">
                  <Icon
                    className={cn("size-[22px]")}
                    strokeWidth={active ? 2.4 : 1.9}
                    aria-hidden
                  />
                  {badge}
                </span>
                <span className={cn(active && "font-bold")}>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
