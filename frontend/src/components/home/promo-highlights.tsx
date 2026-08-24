import { Truck, Sparkles, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const promos = [
  {
    icon: Sparkles,
    title: "کالکشن اختصاصی",
    copy: "منتخب فصل جدید",
    href: "/campaigns/new-season",
    accent: "from-violet-500/30 to-transparent",
  },
  {
    icon: Truck,
    title: "ارسال سریع",
    copy: "ارسال اکسپرس شهرهای بزرگ",
    href: "/campaigns/express",
    accent: "from-sky-500/25 to-transparent",
  },
  {
    icon: ShieldCheck,
    title: "ضمانت اصالت",
    copy: "تضمین کیفیت کالا",
    href: "/pages/authenticity",
    accent: "from-emerald-500/25 to-transparent",
  },
] as const;

/**
 * Compact, brand-level value props. These are static presentation copy (not
 * fabricated backend data), kept concise and premium on a single horizontal
 * scroll row at the smallest widths.
 */
export function PromoHighlights({ className }: { className?: string }) {
  return (
    <section className={cn("px-4", className)}>
      <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
        {promos.map((p) => {
          const Icon = p.icon;
          return (
            <a
              key={p.title}
              href={p.href}
              className={cn(
                "tap-highlight-transparent relative flex min-w-[200px] flex-1 items-center gap-3 overflow-hidden rounded-2xl border border-border/70 bg-surface p-3.5",
                "transition-colors active:bg-surface-hover",
              )}
            >
              <span
                className={cn(
                  "pointer-events-none absolute inset-0 bg-gradient-to-l",
                  p.accent,
                )}
                aria-hidden
              />
              <span className="relative flex size-10 shrink-0 items-center justify-center rounded-xl bg-background/60 text-accent">
                <Icon className="size-5" />
              </span>
              <span className="relative min-w-0">
                <span className="block truncate text-sm font-semibold">
                  {p.title}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {p.copy}
                </span>
              </span>
            </a>
          );
        })}
      </div>
    </section>
  );
}
