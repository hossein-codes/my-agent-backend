import { Truck } from "lucide-react";

/**
 * Slim promotional strip above the header. Static by design — real dynamic
 * messaging (e.g. free-shipping threshold) belongs to system settings and can
 * replace this copy later without touching the layout.
 */
export function AnnouncementBar() {
  return (
    <div className="border-b border-border/70 bg-gradient-to-l from-accent/15 via-accent/5 to-transparent">
      <p className="mx-auto flex w-full max-w-5xl items-center justify-center gap-2 px-4 py-1.5 text-center text-[11px] font-medium text-foreground/80 sm:text-xs">
        <Truck className="size-3.5 shrink-0 text-accent" aria-hidden="true" />
        <span>
          ارسال رایگان برای سفارش‌های بالای <span className="font-bold">۱٫۰۰۰٫۰۰۰ تومان</span>
        </span>
      </p>
    </div>
  );
}
