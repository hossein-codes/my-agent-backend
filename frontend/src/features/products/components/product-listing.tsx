"use client";

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ArrowUpDown, PackageSearch, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { toPersianDigits } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { useProducts } from "../hooks/use-products";
import { type ProductListParams } from "../api/products-api";
import { SortSheet } from "./sort-sheet";
import {
  FilterSheet,
  EMPTY_FILTERS,
  countActiveFilters,
  type FilterState,
} from "./filter-sheet";
import { ProductGrid, ProductGridSkeleton } from "./product-grid";

const PAGE_SIZE = 12;

interface ProductListingProps {
  /** Fixed category context (category page) — hidden from the filter UI. */
  lockedCategory?: string;
  lockedTitle?: string;
  includeSubcategories?: boolean;
  fixedCollection?: string;
  fixedOnSale?: boolean;
}

function readFilters(sp: URLSearchParams): FilterState {
  const list = (k: string) => (sp.get(k) ? sp.get(k)!.split(",").filter(Boolean) : []);
  return {
    colors: list("colors"),
    sizes: list("sizes"),
    brands: list("brands"),
    attrs: Object.fromEntries(
      sp
        .getAll("attrs")
        .map((a) => a.split(":"))
        .filter((p): p is [string, string] => p.length === 2 && Boolean(p[0]) && Boolean(p[1]))
        .map(([k, v]) => [k, v.split("|").filter(Boolean)] as const),
    ),
    minPrice: sp.get("minPrice") ? Number(sp.get("minPrice")) : null,
    maxPrice: sp.get("maxPrice") ? Number(sp.get("maxPrice")) : null,
    inStock: sp.get("inStock") === "true",
    onSale: sp.get("onSale") === "true",
  };
}

/**
 * URL-driven product listing. Every filter/sort/page change rewrites the
 * search params, so results are shareable, back-button safe and SSR-able.
 */
export function ProductListing({
  lockedCategory,
  lockedTitle,
  includeSubcategories,
  fixedCollection,
  fixedOnSale,
}: ProductListingProps) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const [sortOpen, setSortOpen] = React.useState(false);
  const [filterOpen, setFilterOpen] = React.useState(false);

  // Canonical storefront search param is `q` (matches SearchSheet links);
  // `search` is also accepted for deep links.
  const search = sp.get("q") ?? sp.get("search") ?? undefined;
  const sort = (sp.get("sort") as ProductListParams["sort"]) ?? "popular";
  const page = Math.max(1, Number(sp.get("page") ?? 1) || 1);
  const filters = React.useMemo(() => readFilters(sp), [sp]);
  const activeCount = countActiveFilters(filters);

  const params: ProductListParams = {
    page,
    pageSize: PAGE_SIZE,
    sort,
    search,
    category: lockedCategory ?? sp.get("category") ?? undefined,
    includeSubcategories: includeSubcategories ?? sp.get("includeSubcategories") === "true",
    collection: fixedCollection ?? sp.get("collection") ?? undefined,
    brands: filters.brands.length ? filters.brands : undefined,
    colors: filters.colors.length ? filters.colors : undefined,
    sizes: filters.sizes.length ? filters.sizes : undefined,
    attrs: Object.keys(filters.attrs).length ? filters.attrs : undefined,
    minPrice: filters.minPrice ?? undefined,
    maxPrice: filters.maxPrice ?? undefined,
    inStock: filters.inStock || undefined,
    onSale: filters.onSale || fixedOnSale || undefined,
  };

  const { data, isPending, isError, error, isFetching, refetch } = useProducts(params);
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 0;

  const pushParams = (mutate: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(sp.toString());
    mutate(next);
    const qs = next.toString();
    // Stay on the current page context (search page keeps its ?q=, category
    // pages keep their path); /products is the default home for filters.
    const base = pathname.startsWith("/search")
      ? "/search"
      : lockedCategory
        ? `/categories/${lockedCategory}`
        : "/products";
    router.push(qs ? `${base}?${qs}` : base, { scroll: false });
  };

  const applySort = (s: ProductListParams["sort"]) =>
    pushParams((next) => {
      next.set("sort", s ?? "popular");
      next.delete("page");
    });

  const applyFilters = (f: FilterState) =>
    pushParams((next) => {
      const set = (k: string, v: string | null) =>
        v ? next.set(k, v) : next.delete(k);
      set("colors", f.colors.length ? f.colors.join(",") : null);
      set("sizes", f.sizes.length ? f.sizes.join(",") : null);
      set("brands", f.brands.length ? f.brands.join(",") : null);
      next.delete("attrs");
      for (const [k, vs] of Object.entries(f.attrs)) {
        if (vs.length) next.append("attrs", `${k}:${vs.join("|")}`);
      }
      set("minPrice", f.minPrice !== null ? String(f.minPrice) : null);
      set("maxPrice", f.maxPrice !== null ? String(f.maxPrice) : null);
      set("inStock", f.inStock ? "true" : null);
      set("onSale", f.onSale ? "true" : null);
      next.delete("page");
    });

  const goPage = (p: number) => {
    pushParams((next) => next.set("page", String(p)));
    window.scrollTo({ top: 0 });
  };

  const hasAnyFilter = activeCount > 0 || Boolean(search);

  return (
    <div className="flex flex-col gap-3 pb-4">
      {/* Sub header — count + controls */}
      <div className="sticky top-[7.25rem] z-30 -mx-1 flex items-center justify-between gap-2 rounded-2xl border border-border/60 bg-background/95 px-3 py-2 backdrop-blur">
        <p className="min-w-0 truncate text-xs text-muted-foreground">
          {isPending ? (
            "در حال بارگذاری…"
          ) : (
            <>
              <span className="font-nums font-bold text-foreground">
                {toPersianDigits(total.toLocaleString("fa-IR"))}
              </span>{" "}
              کالا{lockedTitle ? ` · ${lockedTitle}` : ""}
            </>
          )}
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSortOpen(true)}
            className="flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-xs font-medium active:bg-muted"
            aria-label="مرتب‌سازی"
          >
            <ArrowUpDown className="size-3.5" aria-hidden />
            مرتب‌سازی
          </button>
          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            className={cn(
              "flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium",
              activeCount > 0
                ? "border-accent bg-accent/10 text-accent"
                : "border-border bg-surface active:bg-muted",
            )}
            aria-label="فیلترها"
          >
            <SlidersHorizontal className="size-3.5" aria-hidden />
            فیلتر
            {activeCount > 0 ? (
              <span className="font-nums font-bold">
                {toPersianDigits(activeCount)}
              </span>
            ) : null}
          </button>
        </div>
      </div>

      {/* Results */}
      {isPending ? (
        <ProductGridSkeleton />
      ) : isError ? (
        <ErrorState
          error={error}
          title="دریافت محصولات با مشکل مواجه شد."
          onRetry={() => void refetch()}
          className="py-16"
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<PackageSearch className="size-7" aria-hidden />}
          title={hasAnyFilter ? "نتیجه‌ای پیدا نشد." : "هنوز محصولی ثبت نشده است."}
          description={
            hasAnyFilter
              ? "فیلترها را تغییر دهید یا حذف کنید و دوباره تلاش کنید."
              : undefined
          }
          action={
            hasAnyFilter ? (
              <Button
                variant="outline"
                className="rounded-full"
                onClick={() => {
                  applyFilters(EMPTY_FILTERS);
                  if (search) pushParams((n) => {
                    n.delete("q");
                    n.delete("search");
                  });
                }}
              >
                حذف فیلترها
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <ProductGrid products={items} priorityFirstRow={page === 1} />
          {isFetching ? <ProductGridSkeleton count={2} /> : null}

          {totalPages > 1 ? (
            <div className="flex items-center justify-center gap-2 px-4 pt-2">
              {page > 1 ? (
                <Button
                  variant="outline"
                  className="min-h-11 rounded-full px-6"
                  onClick={() => goPage(page - 1)}
                >
                  قبلی
                </Button>
              ) : null}
              <span className="font-nums text-xs text-muted-foreground">
                صفحه {toPersianDigits(page)} از {toPersianDigits(totalPages)}
              </span>
              {page < totalPages ? (
                <Button
                  className="min-h-11 rounded-full px-6"
                  onClick={() => goPage(page + 1)}
                  disabled={isFetching}
                >
                  بعدی
                </Button>
              ) : null}
            </div>
          ) : null}
        </>
      )}

      <SortSheet
        open={sortOpen}
        onOpenChange={setSortOpen}
        value={sort ?? "popular"}
        onSelect={applySort}
      />
      <FilterSheet
        open={filterOpen}
        onOpenChange={setFilterOpen}
        value={filters}
        onApply={applyFilters}
      />
    </div>
  );
}
