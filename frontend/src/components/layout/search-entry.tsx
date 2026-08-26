"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { BRAND_NAME } from "@/constants";
import { SearchOverlay } from "@/features/search/components/search-overlay";

interface SearchEntryProps {
  className?: string;
}

/**
 * The header's search trigger. Tapping it opens the full-screen search
 * experience — this is deliberately a button, not a real input, so focus
 * lands inside the overlay's input instead of fighting the header layout.
 */
export function SearchEntry({ className }: SearchEntryProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="جستجو"
        className={cn(
          "tap-highlight-transparent flex h-12 w-full items-center gap-2.5 rounded-full border border-border bg-surface ps-4 pe-5 text-start text-sm text-muted-foreground shadow-sm transition-colors active:bg-surface-hover",
          className,
        )}
      >
        <Search className="size-5 shrink-0 text-accent" aria-hidden />
        <span className="truncate">
          جستجو در {BRAND_NAME}...
        </span>
      </button>

      <SearchOverlay open={open} onOpenChange={setOpen} />
    </>
  );
}
