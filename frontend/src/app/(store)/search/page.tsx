"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Search, SearchX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRecentSearches } from "@/features/search/hooks/use-recent-searches";
import { ProductListing } from "@/features/products/components/product-listing";

const POPULAR = ["لباس مجلسی", "کتانی", "کیف چرم", "ساعت", "تی‌شرت", "پیراهن تابستانی"];

export default function SearchPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const initial = sp.get("q") ?? "";
  const [term, setTerm] = React.useState(initial);
  const [lastInitial, setLastInitial] = React.useState(initial);
  const recent = useRecentSearches();
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Keep the local input in sync when arriving with a new ?q= — adjusted
  // during render (React's recommended pattern) to avoid effect cascades.
  if (initial !== lastInitial) {
    setLastInitial(initial);
    setTerm(initial);
  }
  React.useEffect(() => inputRef.current?.focus(), []);

  const submit = (value: string) => {
    const q = value.trim();
    if (!q) return;
    recent.add(q);
    router.push(`/search?q=${encodeURIComponent(q)}`);
    inputRef.current?.blur();
  };

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Search bar */}
      <div className="sticky top-0 z-40 border-b border-border/70 bg-background/95 px-4 pb-3 pt-[calc(var(--sat)+0.75rem)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-md items-center gap-2">
          <Link
            href="/"
            aria-label="بازگشت"
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-foreground active:bg-muted"
          >
            <ChevronLeft className="size-6" aria-hidden />
          </Link>
          <form
            className="relative flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              submit(term);
            }}
          >
            <Search className="absolute start-3.5 top-1/2 size-4.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              ref={inputRef}
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="جستجو در محصولات لومینا…"
              className="min-h-11 rounded-full ps-10 pe-10"
              aria-label="جستجو"
            />
            {term ? (
              <button
                type="button"
                aria-label="پاک کردن"
                onClick={() => {
                  setTerm("");
                  router.push("/search");
                }}
                className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                <X className="size-4" aria-hidden />
              </button>
            ) : null}
          </form>
        </div>
      </div>

      {initial ? (
        <div className="flex-1 pt-3">
          <ProductListing />
        </div>
      ) : (
        <div className="flex-1 space-y-6 px-4 py-6">
          {recent.items.length > 0 ? (
            <section>
              <div className="mb-2.5 flex items-center justify-between">
                <h2 className="text-[13px] font-bold">جستجوهای اخیر</h2>
                <button
                  type="button"
                  onClick={recent.clear}
                  className="text-[11px] text-muted-foreground active:text-foreground"
                >
                  پاک کردن
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {recent.items.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => submit(r)}
                    className="min-h-9 rounded-full border border-border bg-surface px-3.5 text-xs active:bg-muted"
                  >
                    {r}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <section>
            <h2 className="mb-2.5 text-[13px] font-bold">جستجوهای محبوب</h2>
            <div className="flex flex-wrap gap-2">
              {POPULAR.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => submit(p)}
                  className="min-h-9 rounded-full bg-accent/10 px-3.5 text-xs font-medium text-accent active:bg-accent/20"
                >
                  {p}
                </button>
              ))}
            </div>
          </section>

          <section className="flex flex-col items-center gap-3 pt-10 text-center">
            <span className="flex size-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <SearchX className="size-8" aria-hidden />
            </span>
            <p className="text-xs leading-6 text-muted-foreground">
              نام محصول، دسته یا برند مورد نظر خود را جستجو کنید.
            </p>
            <Button asChild variant="outline" className="rounded-full">
              <Link href="/categories">مرور دسته‌بندی‌ها</Link>
            </Button>
          </section>
        </div>
      )}
    </div>
  );
}
