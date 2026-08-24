"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, LayoutGrid, Search, Heart, User } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useCartCount } from "@/features/cart";
import { useAuth } from "@/features/auth";

type NavItem = {
  href: string;
  label: string;
  icon: typeof Home;
  auth?: boolean;
};

const navItems: NavItem[] = [
  { href: "/", label: "خانه", icon: Home },
  { href: "/categories", label: "دسته‌بندی", icon: LayoutGrid },
  { href: "/search", label: "جستجو", icon: Search },
  { href: "/wishlist", label: "علاقه‌مندی", icon: Heart, auth: true },
  { href: "/account", label: "حساب", icon: User, auth: true },
];

/**
 * Floating mobile bottom navigation. Rounded, translucent, safe-area aware,
 * with an accent pill for the active destination. Hidden at sm+ (desktop gets
 * its own navigation later).
 */
export function MobileNav() {
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();
  const cartCount = useCartCount();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[calc(var(--sab)+0.6rem)] pt-2 sm:hidden"
      aria-label="ناوبری اصلی"
    >
      <ul className="mx-auto flex max-w-md items-center justify-around rounded-3xl border border-border/70 bg-card/85 p-1.5 shadow-lg backdrop-blur-xl">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const href = item.auth && !isAuthenticated ? "/login" : item.href;

          return (
            <li key={item.href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "tap-highlight-transparent relative flex flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[11px] font-medium transition-colors",
                  active
                    ? "bg-accent/15 text-accent"
                    : "text-muted-foreground active:text-foreground",
                )}
              >
                <span className="relative">
                  <Icon
                    className={cn("size-[22px]", active && "text-accent")}
                    strokeWidth={active ? 2.4 : 1.9}
                  />
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
      {/* cartCount reserved for a future FAB; kept referenced to avoid unused */}
      <span className="sr-only" aria-hidden="true">
        {cartCount}
      </span>
    </nav>
  );
}
