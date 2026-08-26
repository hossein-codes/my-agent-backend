"use client";

import * as React from "react";
import { Check, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetTitle,
} from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useFacets } from "../hooks/use-facets";
import { brandsApi } from "@/features/brands";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/constants";
import { cn } from "@/lib/utils/cn";
import { toPersianDigits } from "@/lib/utils/format";
import type { Brand } from "@/types/domain";

/** Filter state shared between the listing page and the sheet. */
export interface FilterState {
  colors: string[];
  sizes: string[];
  brands: string[];
  attrs: Record<string, string[]>;
  minPrice: number | null;
  maxPrice: number | null;
  inStock: boolean;
  onSale: boolean;
}

export const EMPTY_FILTERS: FilterState = {
  colors: [],
  sizes: [],
  brands: [],
  attrs: {},
  minPrice: null,
  maxPrice: null,
  inStock: false,
  onSale: false,
};

export function countActiveFilters(f: FilterState): number {
  return (
    f.colors.length +
    f.sizes.length +
    f.brands.length +
    Object.values(f.attrs).reduce((n, v) => n + v.length, 0) +
    (f.minPrice !== null ? 1 : 0) +
    (f.maxPrice !== null ? 1 : 0) +
    (f.inStock ? 1 : 0) +
    (f.onSale ? 1 : 0)
  );
}

interface FilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: FilterState;
  onApply: (next: FilterState) => void;
}

function Chip({
  active,
  children,
  onClick,
  ariaLabel,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel}
      className={cn(
        "tap-highlight-transparent min-h-11 rounded-full border px-4 text-[13px] font-medium transition-colors",
        active
          ? "border-accent bg-accent/10 text-accent"
          : "border-border bg-surface text-foreground active:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2.5 text-[13px] font-bold text-foreground">{children}</h3>
  );
}

export function FilterSheet({ open, onOpenChange, value, onApply }: FilterSheetProps) {
  // Draft state: edits are local until "apply" — closing discards them.
  // Reset the draft each time the sheet opens, adjusted during render
  // (React's recommended pattern) instead of inside an effect.
  const [draft, setDraft] = React.useState<FilterState>(value);
  const [lastOpen, setLastOpen] = React.useState(open);
  if (open && !lastOpen) {
    setLastOpen(true);
    setDraft(value);
  } else if (!open && lastOpen) {
    setLastOpen(false);
  }

  const facets = useFacets(open);
  const brands = useQuery({
    queryKey: queryKeys.catalog.brands,
    queryFn: (): Promise<Brand[]> => brandsApi.list(),
    enabled: open,
    staleTime: 5 * 60_000,
  });

  const toggle = (key: "colors" | "sizes" | "brands", v: string) =>
    setDraft((d) => ({
      ...d,
      [key]: d[key].includes(v) ? d[key].filter((x) => x !== v) : [...d[key], v],
    }));

  const toggleAttr = (attrSlug: string, valueSlug: string) =>
    setDraft((d) => {
      const cur = d.attrs[attrSlug] ?? [];
      const next = cur.includes(valueSlug)
        ? cur.filter((x) => x !== valueSlug)
        : [...cur, valueSlug];
      return { ...d, attrs: { ...d.attrs, [attrSlug]: next } };
    });

  const parsePrice = (raw: string): number | null => {
    const cleaned = raw.replace(/[^\d]/g, "");
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  };

  const apply = () => {
    if (
      draft.minPrice !== null &&
      draft.maxPrice !== null &&
      draft.minPrice > draft.maxPrice
    ) {
      toast.error("حداقل قیمت نمی‌تواند از حداکثر بیشتر باشد.");
      return;
    }
    onApply(draft);
    onOpenChange(false);
  };

  const attrSections = (facets.data?.attributes ?? []).filter(
    (a) => a.values.length > 0,
  );

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent className="max-h-[88dvh]">
        <BottomSheetHeader>
          <BottomSheetTitle>فیلترها</BottomSheetTitle>
          <button
            type="button"
            onClick={() => setDraft(EMPTY_FILTERS)}
            className="flex items-center gap-1 text-xs text-muted-foreground active:text-foreground"
          >
            <RotateCcw className="size-3.5" aria-hidden />
            حذف همه
          </button>
        </BottomSheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 pb-4">
          {/* Colors */}
          <section>
            <SectionTitle>رنگ</SectionTitle>
            {facets.isLoading ? (
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="size-11 rounded-full" />
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {(facets.data?.colors ?? []).map((c) => {
                  const active = draft.colors.includes(c.slug);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={active}
                      aria-label={c.displayName}
                      onClick={() => toggle("colors", c.slug)}
                      className={cn(
                        "flex size-11 items-center justify-center rounded-full border-2 transition-transform active:scale-95",
                        active ? "border-accent" : "border-border",
                      )}
                    >
                      <span
                        className="flex size-8 items-center justify-center rounded-full border border-black/10"
                        style={{ backgroundColor: c.hexCode }}
                      >
                        {active ? (
                          <Check className="size-4 text-white drop-shadow" aria-hidden />
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <Separator />

          {/* Sizes */}
          <section>
            <SectionTitle>سایز</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {(facets.data?.sizes ?? []).map((s) => (
                <Chip
                  key={s.id}
                  active={draft.sizes.includes(s.slug)}
                  onClick={() => toggle("sizes", s.slug)}
                >
                  {s.label}
                </Chip>
              ))}
            </div>
          </section>

          <Separator />

          {/* Brands */}
          <section>
            <SectionTitle>برند</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {(brands.data ?? [])
                .filter((b) => b.productCount > 0)
                .map((b) => (
                  <Chip
                    key={b.id}
                    active={draft.brands.includes(b.slug)}
                    onClick={() => toggle("brands", b.slug)}
                  >
                    {b.name}
                  </Chip>
                ))}
            </div>
          </section>

          {/* Attribute sections (material, fit, …) */}
          {attrSections.map((attr) => (
            <React.Fragment key={attr.slug}>
              <Separator />
              <section>
                <SectionTitle>{attr.name}</SectionTitle>
                <div className="flex flex-wrap gap-2">
                  {attr.values.map((v) => (
                    <Chip
                      key={v.slug}
                      active={(draft.attrs[attr.slug] ?? []).includes(v.slug)}
                      onClick={() => toggleAttr(attr.slug, v.slug)}
                    >
                      {v.label}
                    </Chip>
                  ))}
                </div>
              </section>
            </React.Fragment>
          ))}

          <Separator />

          {/* Price */}
          <section>
            <SectionTitle>محدوده قیمت (تومان)</SectionTitle>
            <div className="flex items-center gap-2">
              <Input
                inputMode="numeric"
                placeholder="از"
                value={draft.minPrice ?? ""}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, minPrice: parsePrice(e.target.value) }))
                }
                className="min-h-11 text-end"
                aria-label="حداقل قیمت"
              />
              <span className="text-muted-foreground">—</span>
              <Input
                inputMode="numeric"
                placeholder="تا"
                value={draft.maxPrice ?? ""}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, maxPrice: parsePrice(e.target.value) }))
                }
                className="min-h-11 text-end"
                aria-label="حداکثر قیمت"
              />
            </div>
            {(draft.minPrice !== null || draft.maxPrice !== null) && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                {draft.minPrice !== null && `از ${toPersianDigits(draft.minPrice.toLocaleString("fa-IR"))}`}
                {draft.minPrice !== null && draft.maxPrice !== null && " "}
                {draft.maxPrice !== null && `تا ${toPersianDigits(draft.maxPrice.toLocaleString("fa-IR"))}`} تومان
              </p>
            )}
          </section>

          <Separator />

          {/* Toggles */}
          <section className="space-y-2.5 pb-2">
            <label className="flex min-h-11 cursor-pointer items-center justify-between">
              <span className="text-sm">فقط کالاهای موجود</span>
              <input
                type="checkbox"
                className="size-5 accent-[var(--accent)]"
                checked={draft.inStock}
                onChange={(e) => setDraft((d) => ({ ...d, inStock: e.target.checked }))}
              />
            </label>
            <label className="flex min-h-11 cursor-pointer items-center justify-between">
              <span className="text-sm">فقط تخفیف‌دارها</span>
              <input
                type="checkbox"
                className="size-5 accent-[var(--accent)]"
                checked={draft.onSale}
                onChange={(e) => setDraft((d) => ({ ...d, onSale: e.target.checked }))}
              />
            </label>
          </section>
        </div>

        <div className="sticky bottom-0 border-t border-border/70 bg-background/95 p-4 pb-[calc(var(--sab)+1rem)] backdrop-blur">
          <Button
            className="h-12 w-full rounded-full text-[15px] font-bold"
            onClick={apply}
          >
            {countActiveFilters(draft) > 0
              ? `اعمال فیلتر (${toPersianDigits(countActiveFilters(draft))})`
              : "مشاهده نتایج"}
          </Button>
        </div>
      </BottomSheetContent>
    </BottomSheet>
  );
}
