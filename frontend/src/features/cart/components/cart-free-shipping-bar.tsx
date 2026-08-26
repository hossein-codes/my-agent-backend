"use client";

import { Truck } from "lucide-react";
import { formatToman } from "@/lib/utils/format";
import { toPersianDigits } from "@/lib/utils/format";

/** Free-shipping threshold used across the storefront (announcement bar, cart). */
export const FREE_SHIPPING_THRESHOLD = 1_000_000;

/**
 * Progress toward free shipping. Amounts/prices are backend-authoritative;
 * only this static threshold is presented here, matching the announcement.
 */
export function FreeShippingProgress({ subtotal }: { subtotal: number }) {
  const remaining = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal);
  const percent = Math.min(100, Math.round((subtotal / FREE_SHIPPING_THRESHOLD) * 100));

  return (
    <div className="rounded-2xl border border-border/60 bg-surface p-3.5">
      <p className="flex items-center gap-2 text-xs leading-5">
        <Truck className="size-4 shrink-0 text-accent" aria-hidden />
        {remaining > 0 ? (
          <>
            <span className="font-nums font-bold text-accent">
              {formatToman(remaining)}
            </span>{" "}
            تومان دیگر تا ارسال رایگان!
          </>
        ) : (
          <span className="font-bold text-emerald-600">
            ارسال این سفارش رایگان است 🎉
          </span>
        )}
      </p>
      <div
        className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="پیشرفت ارسال رایگان"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="font-nums mt-1.5 text-[10px] text-muted-foreground">
        {toPersianDigits(percent)}٪ از سقف ارسال رایگان
      </p>
    </div>
  );
}
