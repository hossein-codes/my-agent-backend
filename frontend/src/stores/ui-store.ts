"use client";

import { create } from "zustand";

/**
 * Global client UI state.
 *
 * ONLY state that is truly cross-cutting and not owned by a feature lives
 * here (mobile navigation, global search sheet, etc.). Feature/business state
 * belongs in feature stores or TanStack Query (server state).
 */
interface UiState {
  mobileNavOpen: boolean;
  searchOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
  setSearchOpen: (open: boolean) => void;
  toggleMobileNav: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  mobileNavOpen: false,
  searchOpen: false,
  setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  toggleMobileNav: () =>
    set((s) => ({ mobileNavOpen: !s.mobileNavOpen })),
}));
