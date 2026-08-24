"use client";

import { useCallback, useMemo, useState } from "react";

const STORAGE_KEY = "lumina.recent-searches";
const MAX_ITEMS = 8;

function read(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((x): x is string => typeof x === "string");
      }
    }
  } catch {
    // Corrupted storage — ignore and start fresh.
  }
  return [];
}

function write(next: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Quota / private mode — non-fatal.
  }
}

/**
 * Isolated, client-side recent searches (localStorage only — never sent to the
 * backend). Lives in the search feature, not a global store.
 */
export function useRecentSearches() {
  // Lazy initializer reads localStorage once on the client (no hydration
  // mismatch because server always renders []).
  const [items, setItems] = useState<string[]>(read);

  const add = useCallback((term: string) => {
    const clean = term.trim();
    if (clean.length < 2) return;
    setItems((prev) => {
      const next = [
        clean,
        ...prev.filter(
          (x) => x.toLocaleLowerCase("fa") !== clean.toLocaleLowerCase("fa"),
        ),
      ].slice(0, MAX_ITEMS);
      write(next);
      return next;
    });
  }, []);

  const remove = useCallback((term: string) => {
    setItems((prev) => {
      const next = prev.filter((x) => x !== term);
      write(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setItems([]);
    write([]);
  }, []);

  return useMemo(
    () => ({ items, add, remove, clear, ready: true }),
    [items, add, remove, clear],
  );
}
