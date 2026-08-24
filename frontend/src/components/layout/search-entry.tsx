"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { SearchSheet } from "@/features/search/components/search-sheet";

/**
 * Sticky search trigger. The visual entry stays in the header; tapping opens
 * the full-screen Search bottom sheet. The trigger reads like a search field
 * but is a button (no cramped typing in a 40px-tall bar).
 */
export function SearchEntry() {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="جستجو"
        className="tap-highlight-transparent flex h-12 w-full items-center gap-2.5 rounded-full border border-border bg-surface px-4 text-start text-sm text-muted-foreground shadow-sm transition-colors active:bg-surface-hover"
      >
        <Search className="size-5 shrink-0 text-accent" aria-hidden />
        <span className="truncate">جستجو در محصولات لومینا...</span>
      </button>

      <SearchSheet open={open} onOpenChange={setOpen} />
    </>
  );
}
