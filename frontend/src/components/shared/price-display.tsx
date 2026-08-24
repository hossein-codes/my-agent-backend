import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { formatToman, formatTomanWithCurrency } from "@/lib/utils/format";

interface PriceDisplayProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Integer Toman, as returned by the backend. Never computed on the client. */
  value: number | null | undefined;
  /** Show currency suffix inline. Defaults to true. */
  withCurrency?: boolean;
  /** Render as muted, e.g. for a strikethrough old price. */
  muted?: boolean;
  size?: "sm" | "base" | "lg";
  /** Locale for digit rendering. Defaults to Persian. */
  locale?: "fa" | "en";
}

const sizeClass = {
  sm: "text-sm",
  base: "text-base",
  lg: "text-lg font-semibold",
} as const;

/**
 * Renders an integer Toman amount. Pure presentation — it never performs
 * financial math. Use `oldPrice` separately to show a strikethrough base price.
 */
export function PriceDisplay({
  value,
  withCurrency = true,
  muted = false,
  size = "base",
  locale = "fa",
  className,
  ...props
}: PriceDisplayProps) {
  if (value === null || value === undefined) {
    return (
      <span
        className={cn("text-muted-foreground", sizeClass[size], className)}
        aria-label="ناموجود"
        {...props}
      >
        —
      </span>
    );
  }

  const text = withCurrency
    ? formatTomanWithCurrency(value, locale)
    : formatToman(value, locale);

  return (
    <span
      className={cn(
        "font-nums",
        muted ? "text-muted-foreground line-through" : "text-foreground",
        sizeClass[size],
        className,
      )}
      {...props}
    >
      {text}
    </span>
  );
}
