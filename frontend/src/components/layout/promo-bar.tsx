"use client";

import * as React from "react";
import { RotateCw, Truck } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * Compact promotional strip pinned above the header (both live inside the
 * same sticky block in the store layout, so the promo bar never scrolls
 * away and always stacks above the header).
 *
 * Messages rotate with a subtle crossfade every 6s. Rotation is decorative:
 * `motion-safe:` keeps it static for reduced-motion users.
 */
const MESSAGES: Array<{ icon: typeof Truck; text: string }> = [
  { icon: Truck, text: "ارسال رایگان برای سفارش‌های بالای ۱٫۰۰۰٫۰۰۰ تومان" },
  { icon: RotateCw, text: "۷ روز ضمانت بازگشت کالا · پرداخت امن" },
];

const ROTATE_MS = 6000;

export function PromoBar({ className }: { className?: string }) {
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    if (MESSAGES.length < 2) return;
    const t = setInterval(
      () => setIndex((i) => (i + 1) % MESSAGES.length),
      ROTATE_MS,
    );
    return () => clearInterval(t);
  }, []);

  const { icon: Icon, text } = MESSAGES[index] ?? MESSAGES[0]!;

  return (
    <div
      className={cn(
        "bg-foreground text-background",
        className,
      )}
      role="region"
      aria-label="پیام‌های فروشگاه"
    >
      <p
        key={index}
        className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500 mx-auto flex w-full max-w-5xl items-center justify-center gap-1.5 px-4 py-[7px] text-center text-[11px] font-medium leading-5"
      >
        <Icon className="size-3.5 shrink-0 opacity-80" aria-hidden />
        <span className="truncate">{text}</span>
      </p>
    </div>
  );
}
