"use client";

import { useEffect, useState } from "react";

/**
 * Subscribe to a CSS media query. SSR-safe (defaults to false on the server).
 * Mobile-first: prefer `min-width` breakpoints.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** Tailwind `md` breakpoint (768px). Use to branch mobile vs. desktop layout. */
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 768px)");
}
