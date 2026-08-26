"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Flame,
  History,
  PackageSearch,
  Search,
  X,
} from "lucide-react";
import { useDebouncedCallback } from "use-debounce";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/error-state";
import { PriceDisplay } from "@/components/shared/price-display";
import { ProductImage } from "@/components/shared/product-image";
import { BRAND_NAME } from "@/constants";
import { useCategoryTree } from "@/features/categories";
import { toPersianDigits } from "@/lib/utils/format";
import { useRecentSearches } from "../hooks/use-recent-searches";
import { useSearchSuggestions } from "../hooks/use-search-suggestions";
import { useSearchProducts } from "../hooks/use-search-products";
import type { ProductListItem } from "@/types/domain";

interface SearchOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TRENDING = ["لباس مجلسی", "کتانی", "کیف چرم", "ساعت", "پیراهن تابستانی", "بافت"];

const MIN_CHARS = 2;
const DEBOUNCE_MS = 280;

/**
 * Full-screen search mode. Opens with a bottom-to-top slide (see the
 * `fullscreen` dialog variant), covers the bottom navigation, locks the
 * background scroll (Radix) and closes via button, Android back, or the
 * browser back button.
 */
export function SearchOverlay({ open, onOpenChange }: SearchOverlayProps) {
  const router = useRouter();
  const [value, setValue] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const recent = useRecentSearches();
  const inputRef = React.useRef<HTMLInputElement>(null);

  const debounce = useDebouncedCallback((v: string) => setDebounced(v.trim()), DEBOUNCE_MS);

  // Reset to a clean discovery state each time the overlay opens.
  const [wasOpen, setWasOpen] = React.useState(false);
  if (open && !wasOpen) {
    setWasOpen(true);
    setValue("");
    setDebounced("");
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  // Android/browser back closes the overlay instead of leaving the page:
  // push a history entry on open; popstate = close.
  const pushed = React.useRef(false);
  React.useEffect(() => {
    if (!open) return;
    window.history.pushState({ luminaSearch: true }, "");
    pushed.current = true;
    const onPop = () => {
      pushed.current = false;
      onOpenChange(false);
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (pushed.current) {
        pushed.current = false;
        window.history.back();
      }
    };
  }, [open, onOpenChange]);

  const searching = open && debounced.length >= MIN_CHARS;
  const suggestions = useSearchSuggestions(debounced, searching);
  const products = useSearchProducts(debounced, open);
  const categories = useCategoryTree();

  const loading = searching && (products.isFetching || suggestions.isFetching);
  const failed = searching && products.isError && !products.data;
  const items = searching ? (products.data?.items ?? []) : [];
  const total = searching ? (products.data?.total ?? 0) : 0;
  const entityHits = (suggestions.data?.items ?? []).filter(
    (s) => s.type !== "product",
  );

  const close = () => onOpenChange(false);

  const runSearch = (term: string) => {
    const q = term.trim();
    if (!q) return;
    recent.add(q);
    close();
    router.push(`/search?q=${encodeURIComponent(q)}`);
  };

  const go = (href: string) => {
    close();
    router.push(href);
  };

  const topCategories = (categories.data ?? [])
    .filter((c) => c.productCount > 0 || c.children.length > 0)
    .slice(0, 4);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        display="fullscreen"
        showClose={false}
        className="bg-background"
        aria-describedby={undefined}
        onOpenAutoFocus={(e) => {
          // Land in the input the moment the overlay opens (spec: ready to type).
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <DialogTitle className="sr-only">جستجو در {BRAND_NAME}</DialogTitle>

        <div className="flex h-dvh flex-col">
          {/* Input bar */}
          <div className="shrink-0 border-b border-border/70 bg-background px-2 pb-2.5 pt-[calc(var(--sat)+0.5rem)]">
            <div className="mx-auto flex w-full max-w-2xl items-center gap-1">
              <button
                type="button"
                onClick={close}
                aria-label="بستن جستجو"
                className="tap-highlight-transparent flex size-11 shrink-0 items-center justify-center rounded-full text-foreground active:bg-muted"
              >
                <ArrowRight className="size-6" aria-hidden />
              </button>
              <form
                className="relative min-w-0 flex-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  runSearch(value);
                }}
              >
                <Search
                  className="pointer-events-none absolute start-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <input
                  ref={inputRef}
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value);
                    debounce(e.target.value);
                  }}
                  type="search"
                  enterKeyHint="search"
                  autoComplete="off"
                  placeholder={`جستجو در ${BRAND_NAME}...`}
                  aria-label="جستجو"
                  dir="auto"
                  className="h-11 w-full rounded-full border border-border bg-surface ps-10 pe-10 text-[15px] outline-none placeholder:text-muted-foreground focus:border-accent"
                />
                {value ? (
                  <button
                    type="button"
                    onClick={() => {
                      setValue("");
                      setDebounced("");
                      inputRef.current?.focus();
                    }}
                    aria-label="پاک کردن"
                    className="absolute end-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
                  >
                    {/* Small visual pill inside a 36px hit area. */}
                    <span className="flex size-6 items-center justify-center rounded-full bg-muted">
                      <X className="size-3.5" aria-hidden />
                    </span>
                  </button>
                ) : null}
              </form>
            </div>
          </div>

          {/* Scrollable body */}
          <div className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(var(--sab)+1.5rem)] pt-4">
            {!searching ? (
              <DiscoveryPanel
                recentItems={recent.items}
                onClearRecent={recent.clear}
                onPick={(term) => runSearch(term)}
                categories={topCategories}
                categoriesPending={categories.isPending}
                onGoCategory={(slug) => go(`/categories/${slug}`)}
              />
            ) : failed ? (
              <ErrorState
                error={products.error}
                title="جستجو با مشکل مواجه شد."
                onRetry={() => void products.refetch()}
                className="py-16"
              />
            ) : loading ? (
              <ResultsSkeleton />
            ) : total === 0 && entityHits.length === 0 ? (
              <NoResults term={debounced} onPick={(t) => runSearch(t)} />
            ) : (
              <div className="space-y-5">
                {entityHits.length > 0 ? (
                  <section>
                    <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                      پیشنهادهای جستجو
                    </h2>
                    <div className="flex flex-wrap gap-2">
                      {entityHits.map((s) => (
                        <Link
                          key={`${s.type}-${s.label}`}
                          href={s.href}
                          onClick={close}
                          className="min-h-9 rounded-full border border-border bg-surface px-3.5 text-xs font-medium active:bg-muted"
                        >
                          {s.label}
                        </Link>
                      ))}
                    </div>
                  </section>
                ) : null}

                {items.length > 0 ? (
                  <section>
                    <h2 className="mb-2 text-[13px] font-bold">
                      نتایج برای «{debounced}»{" "}
                      <span className="font-nums text-[11px] font-normal text-muted-foreground">
                        ({toPersianDigits(total.toLocaleString("fa-IR"))} کالا)
                      </span>
                    </h2>
                    <ul className="divide-y divide-border/60">
                      {items.map((p) => (
                        <ProductRow key={p.id} product={p} onClick={close} />
                      ))}
                    </ul>
                    <button
                      type="button"
                      onClick={() => runSearch(debounced)}
                      className="mt-3 min-h-11 w-full rounded-full border border-border bg-surface text-sm font-bold active:bg-muted"
                    >
                      مشاهده همه نتایج
                    </button>
                  </section>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Discovery (no query yet)                                                    */
/* -------------------------------------------------------------------------- */

function SectionTitle({
  icon: Icon,
  children,
  action,
}: {
  icon?: typeof Flame;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-2.5 flex items-center justify-between">
      <h2 className="flex items-center gap-1.5 text-[13px] font-bold text-foreground">
        {Icon ? <Icon className="size-4 text-accent" aria-hidden /> : null}
        {children}
      </h2>
      {action}
    </div>
  );
}

function DiscoveryPanel({
  recentItems,
  onClearRecent,
  onPick,
  categories,
  categoriesPending,
  onGoCategory,
}: {
  recentItems: string[];
  onClearRecent: () => void;
  onPick: (term: string) => void;
  categories: Array<{ id: string; name: string; slug: string; productCount: number }>;
  categoriesPending: boolean;
  onGoCategory: (slug: string) => void;
}) {
  return (
    <div className="space-y-6">
      {recentItems.length > 0 ? (
        <section>
          <SectionTitle
            icon={History}
            action={
              <button
                type="button"
                onClick={onClearRecent}
                className="min-h-10 px-1 text-[11px] text-muted-foreground active:text-foreground"
              >
                پاک کردن
              </button>
            }
          >
            جستجوهای اخیر
          </SectionTitle>
          <div className="flex flex-wrap gap-2">
            {recentItems.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => onPick(r)}
                className="min-h-9 rounded-full border border-border bg-surface px-3.5 text-xs active:bg-muted"
              >
                {r}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <SectionTitle icon={Flame}>جستجوهای محبوب</SectionTitle>
        <div className="flex flex-wrap gap-2">
          {TRENDING.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onPick(t)}
              className="min-h-9 rounded-full bg-accent/10 px-3.5 text-xs font-medium text-accent active:bg-accent/20"
            >
              {t}
            </button>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle>دسته‌بندی‌های محبوب</SectionTitle>
        {categoriesPending ? (
          <div className="grid grid-cols-2 gap-2.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onGoCategory(c.slug)}
                className="flex min-h-16 flex-col items-start justify-center gap-0.5 rounded-2xl border border-border/60 bg-surface px-4 py-3 text-start active:bg-surface-hover"
              >
                <span className="text-[13px] font-bold">{c.name}</span>
                <span className="font-nums text-[11px] text-muted-foreground">
                  {c.productCount.toLocaleString("fa-IR")} کالا
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* States                                                                      */
/* -------------------------------------------------------------------------- */

function ResultsSkeleton() {
  return (
    <div className="space-y-3" aria-label="در حال جستجو" aria-live="polite">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-1">
          <Skeleton className="h-20 w-16 shrink-0 rounded-xl" />
          <div className="w-full space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function NoResults({
  term,
  onPick,
}: {
  term: string;
  onPick: (term: string) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-12 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <PackageSearch className="size-8" aria-hidden />
      </span>
      <div>
        <p className="text-sm font-bold">نتیجه‌ای برای «{term}» پیدا نشد.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          املای عبارت را بررسی کنید یا از پیشنهادها استفاده کنید.
        </p>
      </div>
      <div className="w-full max-w-sm">
        <p className="mb-2 text-[11px] font-bold text-muted-foreground">
          پیشنهادهای مشابه
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {TRENDING.slice(0, 4).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onPick(t)}
              className="min-h-9 rounded-full border border-border bg-surface px-3.5 text-xs font-medium active:bg-muted"
            >
              {t}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProductRow({
  product,
  onClick,
}: {
  product: ProductListItem;
  onClick: () => void;
}) {
  return (
    <li>
      <Link
        href={`/products/${product.slug}`}
        onClick={onClick}
        className="flex min-h-[5.5rem] items-center gap-3 py-2.5 active:opacity-70"
      >
        <ProductImage
          src={product.image}
          alt={product.imageAlt ?? product.name}
          width={64}
          height={80}
          className="h-20 w-16 shrink-0 rounded-xl"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-bold leading-5">{product.name}</p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {[product.brand?.name, product.category?.name].filter(Boolean).join(" · ")}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <PriceDisplay
              value={product.priceFrom}
              size="sm"
              className="font-extrabold"
            />
            {product.onSale && product.basePriceFrom ? (
              <PriceDisplay
                value={product.basePriceFrom}
                muted
                size="sm"
                className="text-[11px] line-through"
              />
            ) : null}
            {product.discountPercent > 0 ? (
              <span className="font-nums rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold text-accent-foreground">
                ٪{toPersianDigits(product.discountPercent)}
              </span>
            ) : null}
          </div>
        </div>
      </Link>
    </li>
  );
}
