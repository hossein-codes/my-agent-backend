"use client";

import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";

interface QuantitySelectorProps {
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  size?: "sm" | "md";
  disabled?: boolean;
  className?: string;
  /** Accessible label for the control group. */
  label?: string;
}

/**
 * Accessible stepper. Shared across product/cart because it knows nothing
 * about either domain — it only emits numbers.
 */
export function QuantitySelector({
  value,
  min = 1,
  max = 10,
  onChange,
  size = "md",
  disabled = false,
  className,
  label = "تعداد",
}: QuantitySelectorProps) {
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));

  const box = size === "sm" ? "size-9" : "size-11";
  const icon = size === "sm" ? "size-4" : "size-5";

  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "inline-flex items-center rounded-lg border bg-card",
        className,
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className={cn(box, "rounded-none rounded-e-lg")}
        onClick={dec}
        disabled={disabled || value <= min}
        aria-label="کاهش تعداد"
      >
        <Minus className={icon} />
      </Button>
      <span
        aria-live="polite"
        aria-atomic="true"
        className="min-w-8 text-center font-nums text-sm font-medium"
      >
        {value}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className={cn(box, "rounded-none rounded-s-lg")}
        onClick={inc}
        disabled={disabled || value >= max}
        aria-label="افزایش تعداد"
      >
        <Plus className={icon} />
      </Button>
    </div>
  );
}
