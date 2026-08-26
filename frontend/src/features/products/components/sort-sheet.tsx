"use client";

import { Check } from "lucide-react";
import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetTitle,
} from "@/components/ui/bottom-sheet";
import { cn } from "@/lib/utils/cn";
import type { SortKey } from "@/types/domain";

export const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "popular", label: "محبوب‌ترین" },
  { value: "newest", label: "جدیدترین" },
  { value: "price_asc", label: "ارزان‌ترین" },
  { value: "price_desc", label: "گران‌ترین" },
  { value: "name", label: "نام (الفبا)" },
];

interface SortSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: SortKey;
  /** Called with the new sort; the page updates the URL. */
  onSelect: (sort: SortKey) => void;
}

export function SortSheet({ open, onOpenChange, value, onSelect }: SortSheetProps) {
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent>
        <BottomSheetHeader>
          <BottomSheetTitle>مرتب‌سازی</BottomSheetTitle>
        </BottomSheetHeader>
        <ul className="p-2 pb-6">
          {SORT_OPTIONS.map((opt) => {
            const active = opt.value === value;
            return (
              <li key={opt.value}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(opt.value);
                    onOpenChange(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between rounded-xl px-4 py-3.5 text-start text-[15px] transition-colors",
                    active
                      ? "font-bold text-accent"
                      : "text-foreground active:bg-muted",
                  )}
                  aria-pressed={active}
                >
                  {opt.label}
                  {active ? <Check className="size-5" aria-hidden /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      </BottomSheetContent>
    </BottomSheet>
  );
}
