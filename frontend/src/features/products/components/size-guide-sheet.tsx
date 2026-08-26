"use client";

import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetTitle,
  BottomSheetDescription,
} from "@/components/ui/bottom-sheet";
import { toPersianDigits } from "@/lib/utils/format";

const ALPHA_ROWS: Array<[string, string, string]> = [
  ["XS", "۸۲–۸۷", "۶۴–۶۹"],
  ["S", "۸۸–۹۳", "۶۹–۷۴"],
  ["M", "۹۴–۹۹", "۷۴–۷۹"],
  ["L", "۱۰۰–۱۰۵", "۷۹–۸۴"],
  ["XL", "۱۰۶–۱۱۱", "۸۴–۸۹"],
  ["XXL", "۱۱۲–۱۱۷", "۸۹–۹۴"],
];

const NUM_ROWS: Array<[string, string]> = [
  ["۳۶", "۳۶"],
  ["۳۸", "۳۸"],
  ["۴۰", "۴۰"],
  ["۴۲", "۴۲"],
  ["۴۴", "۴۴"],
  ["۴۶", "۴۶"],
];

interface SizeGuideSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "alpha" for S/M/L…, "numeric" for 38/40… */
  kind?: "alpha" | "numeric";
}

export function SizeGuideSheet({ open, onOpenChange, kind = "alpha" }: SizeGuideSheetProps) {
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent className="max-h-[80dvh]">
        <BottomSheetHeader>
          <BottomSheetTitle>راهنمای سایز</BottomSheetTitle>
          <BottomSheetDescription className="text-xs text-muted-foreground">
            اندازه‌ها بر حسب سانتی‌متر و مربوط به دور بدن هستند.
          </BottomSheetDescription>
        </BottomSheetHeader>

        <div className="overflow-y-auto px-4 pb-[calc(var(--sab)+1rem)]">
          {kind === "alpha" ? (
            <>
              <table className="w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-border/70 text-center text-xs">
                <thead>
                  <tr className="bg-muted/60">
                    <th className="border-b border-border/70 p-3 font-bold">سایز</th>
                    <th className="border-b border-border/70 p-3 font-bold">دور سینه</th>
                    <th className="border-b border-border/70 p-3 font-bold">دور کمر</th>
                  </tr>
                </thead>
                <tbody>
                  {ALPHA_ROWS.map(([size, chest, waist]) => (
                    <tr key={size} className="odd:bg-surface even:bg-muted/30">
                      <td className="font-nums border-b border-border/40 p-3 font-bold">{size}</td>
                      <td className="font-nums border-b border-border/40 p-3">{chest}</td>
                      <td className="font-nums border-b border-border/40 p-3">{waist}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-4 text-[11px] leading-5 text-muted-foreground">
                اگر اندازه شما بین دو سایز است، سایز بزرگ‌تر را انتخاب کنید.
                برای پیراهن و تی‌شرت، دور سینه را در برجسته‌ترین نقطه اندازه بگیرید.
              </p>
            </>
          ) : (
            <>
              <table className="w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-border/70 text-center text-xs">
                <thead>
                  <tr className="bg-muted/60">
                    <th className="border-b border-border/70 p-3 font-bold">سایز (EU)</th>
                    <th className="border-b border-border/70 p-3 font-bold">طول کف پا</th>
                  </tr>
                </thead>
                <tbody>
                  {NUM_ROWS.map(([eu, foot]) => (
                    <tr key={eu} className="odd:bg-surface even:bg-muted/30">
                      <td className="font-nums border-b border-border/40 p-3 font-bold">{eu}</td>
                      <td className="font-nums border-b border-border/40 p-3">{toPersianDigits(foot)} سانتی‌متر</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-4 text-[11px] leading-5 text-muted-foreground">
                طول کف پا را از پاشنه تا انگشت بزرگ، ایستاده و عصر (وقتی پا کمی متورم‌تر است) اندازه بگیرید.
              </p>
            </>
          )}
        </div>
      </BottomSheetContent>
    </BottomSheet>
  );
}
