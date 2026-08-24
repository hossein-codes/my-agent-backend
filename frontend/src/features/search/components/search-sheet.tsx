"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search, X, Clock, ArrowLeft } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { useDebouncedCallback } from "use-debounce";
import { cn } from "@/lib/utils/cn";
import { useSearchSuggestions } from "@/features/search";
import { useRecentSearches } from "../hooks/use-recent-searches";
import type { SearchSuggestion } from "@/types/domain";

interface SearchSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const POPULAR: { label: string; href: string }[] = [
  { label: "لباس مجلسی", href: "/search?q=لباس+مجلسی" },
  { label: "کتانی", href: "/search?q=کتانی" },
  { label: "کیف چرم", href: "/search?q=کیف+چرم" },
  { label: "ساعت", href: "/search?q=ساعت" },
];

export function SearchSheet({ open, onOpenChange }: SearchSheetProps) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [query, setQuery] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const recent = useRecentSearches();

  const debounce = useDebouncedCallback((value: string) => {
    setDebounced(value.trim());
  }, 280);

  const suggestions = useSearchSuggestions(debounced, open);

  // Focus the input when the sheet finishes opening.
  const onOpenAutoFocus = (e: Event) => {
    e.preventDefault();
    // Defer to next frame so the keyboard appears reliably on mobile.
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const onCloseAutoFocus = (e: Event) => {
    e.preventDefault();
  };

  const resetOnClose = (isOpen: boolean) => {
    onOpenChange(isOpen);
    if (!isOpen) {
      setQuery("");
      setDebounced("");
    }
  };

  const runSearch = (term: string, href?: string) => {
    const q = term.trim();
    if (q.length < 2) return;
    recent.add(q);
    onOpenChange(false);
    setQuery("");
    setDebounced("");
    if (href) router.push(href);
    else router.push(`/search?q=${encodeURIComponent(q)}`);
  };

  const showSuggestions = debounced.length >= 2;
  const isLoading = showSuggestions && suggestions.isFetching;

  return (
    <Dialog.Root open={open} onOpenChange={resetOnClose}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            "fixed inset-0 z-[60] bg-slate-900/30 backdrop-blur-[2px]",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
          )}
        />
        <Dialog.Content
          dir="rtl"
          onOpenAutoFocus={onOpenAutoFocus}
          onCloseAutoFocus={onCloseAutoFocus}
          onEscapeKeyDown={() => onOpenChange(false)}
          className={cn(
            "fixed inset-x-0 bottom-0 top-0 z-[61] flex flex-col bg-background shadow-lg outline-none",
            "rounded-t-3xl sm:top-auto sm:max-h-[88dvh] sm:rounded-3xl",
            "data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom",
            "data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom",
          )}
          // dvh adapts to the mobile virtual keyboard / browser chrome.
          style={{ height: "100dvh", maxHeight: "100dvh" }}
        >
          <Dialog.Title className="sr-only">جستجو</Dialog.Title>
          <Dialog.Description className="sr-only">
            جستجو در محصولات، دسته‌بندی‌ها و برندها
          </Dialog.Description>

          {/* Drag handle */}
          <div
            className="flex shrink-0 justify-center pt-2.5 sm:hidden"
            aria-hidden
          >
            <span className="h-1.5 w-10 rounded-full bg-border" />
          </div>

          {/* Header: close + input */}
          <div className="flex items-center gap-2 px-3 pb-2 pt-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="بستن جستجو"
              className="flex size-11 shrink-0 items-center justify-center rounded-full text-foreground/80 active:bg-accent-soft"
            >
              <ArrowLeft className="size-5" />
            </button>

            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute start-3.5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                ref={inputRef}
                type="search"
                inputMode="search"
                enterKeyHint="search"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  debounce(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") runSearch(query);
                }}
                placeholder="جستجو در محصولات لومینا..."
                aria-label="جستجو در محصولات"
                className="h-12 w-full rounded-full border border-border bg-surface pe-11 ps-11 text-[16px] text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-accent focus:bg-background focus:ring-2 focus:ring-accent/25"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setDebounced("");
                    inputRef.current?.focus();
                  }}
                  aria-label="پاک کردن جستجو"
                  className="absolute end-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground active:bg-accent-soft"
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(var(--sab)+1.5rem)] pt-2">
            {showSuggestions ? (
              <SuggestionResults
                isLoading={isLoading}
                isError={suggestions.isError}
                items={suggestions.data?.items ?? []}
                query={debounced}
                onSelect={(s) => runSearch(s.label, s.href)}
                onSubmit={() => runSearch(debounced)}
                onRetry={() => suggestions.refetch()}
              />
            ) : (
              <IdleContent
                recent={recent.items}
                ready={recent.ready}
                onPickRecent={(t) => runSearch(t)}
                onRemoveRecent={recent.remove}
                onClearRecent={recent.clear}
                onPickPopular={(p) => runSearch(p.label, p.href)}
              />
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function IdleContent({
  recent,
  ready,
  onPickRecent,
  onRemoveRecent,
  onClearRecent,
  onPickPopular,
}: {
  recent: string[];
  ready: boolean;
  onPickRecent: (t: string) => void;
  onRemoveRecent: (t: string) => void;
  onClearRecent: () => void;
  onPickPopular: (p: { label: string; href: string }) => void;
}) {
  return (
    <div className="flex flex-col gap-6 py-2">
      {ready && recent.length > 0 ? (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold">جستجوهای اخیر</h3>
            <button
              type="button"
              onClick={onClearRecent}
              className="text-xs font-medium text-muted-foreground active:text-accent"
            >
              پاک کردن
            </button>
          </div>
          <ul className="flex flex-col">
            {recent.map((term) => (
              <li key={term}>
                <div className="group flex items-center gap-3 rounded-xl px-1 py-2.5 active:bg-surface">
                  <button
                    type="button"
                    onClick={() => onPickRecent(term)}
                    className="flex flex-1 items-center gap-3 text-start"
                  >
                    <Clock className="size-4 text-muted-foreground" />
                    <span className="text-sm text-foreground/90">{term}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveRecent(term)}
                    aria-label={`حذف ${term}`}
                    className="flex size-8 items-center justify-center rounded-full text-muted-foreground active:bg-surface"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h3 className="mb-2 text-sm font-bold">جستجوهای پرطرفدار</h3>
        <div className="flex flex-wrap gap-2">
          {POPULAR.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => onPickPopular(p)}
              className="tap-highlight-transparent rounded-full border border-border bg-surface px-3.5 py-2 text-xs font-medium text-foreground/80 transition-colors active:border-accent active:bg-accent-soft active:text-accent"
            >
              {p.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function SuggestionResults({
  isLoading,
  isError,
  items,
  query,
  onSelect,
  onSubmit,
  onRetry,
}: {
  isLoading: boolean;
  isError: boolean;
  items: SearchSuggestion[];
  query: string;
  onSelect: (s: SearchSuggestion) => void;
  onSubmit: () => void;
  onRetry: () => void;
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 py-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-9 animate-pulse rounded-xl bg-surface" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-sm font-medium">خطا در دریافت پیشنهادها</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          اتصال اینترنت را بررسی کنید یا مستقیماً جستجو کنید.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onRetry}
            className="rounded-full border border-border px-4 py-2 text-xs font-medium active:bg-surface"
          >
            تلاش دوباره
          </button>
          <button
            type="button"
            onClick={onSubmit}
            className="rounded-full bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground"
          >
            جستجوی «{query}»
          </button>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <Search className="size-8 text-muted-foreground" />
        <p className="text-sm font-medium">نتیجه‌ای پیدا نشد</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          برای «{query}» موردی یافت نشد. می‌توانید مستقیماً جستجو کنید.
        </p>
        <button
          type="button"
          onClick={onSubmit}
          className="mt-1 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground"
        >
          جستجوی «{query}»
        </button>
      </div>
    );
  }

  return (
    <ul className="flex flex-col pb-4 pt-1">
      {items.map((s, i) => (
        <li key={`${s.type}-${s.href}-${i}`}>
          <button
            type="button"
            onClick={() => onSelect(s)}
            className="tap-highlight-transparent flex w-full items-center gap-3 rounded-xl px-2 py-3 text-start active:bg-surface"
          >
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate text-sm text-foreground/90">
              {s.label}
            </span>
            <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {typeLabel(s.type)}
            </span>
          </button>
        </li>
      ))}
      <li className="mt-1 border-t pt-2">
        <button
          type="button"
          onClick={onSubmit}
          className="flex w-full items-center gap-2 rounded-xl px-2 py-3 text-sm font-semibold text-accent active:bg-accent-soft"
        >
          <Search className="size-4" />
          جستجوی «{query}»
        </button>
      </li>
    </ul>
  );
}

function typeLabel(type: string): string {
  switch (type) {
    case "product":
      return "محصول";
    case "category":
      return "دسته";
    case "brand":
      return "برند";
    default:
      return type;
  }
}
