"use client";

import { create } from "zustand";
import { authApi } from "../api/auth-api";
import type { AuthSession, AuthState } from "../types";
import type { CurrentUser } from "@/types/domain";

const STORAGE_KEY = "auth.session";
// Refresh ~60s before expiry, as recommended in the API contract.
const REFRESH_LEAD_MS = 60_000;

/**
 * Auth store — the SINGLE place that holds the access token and session.
 *
 * Security:
 *   - The refresh token lives in an HttpOnly cookie set by the backend; it is
 *     never read by JS. We only keep the short-lived access token in memory,
 *     persisted to localStorage so a page reload can restore the session
 *     without a fresh OTP. The access token has a 15-minute TTL.
 *   - Sensitive credentials are never stored in localStorage.
 *
 * Single-use refresh:
 *   - The backend invalidates the whole session family if two refreshes run
 *     concurrently, so all refreshes are serialized through `refreshMutex`.
 */

interface AuthStore extends AuthState {
  setSession: (session: AuthSession) => void;
  setUser: (user: CurrentUser | null) => void;
  clear: () => void;
  hydrate: () => void;
  refresh: () => Promise<AuthSession | null>;
}

let refreshMutex: Promise<AuthSession | null> | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

function persist(session: AuthSession | null): void {
  if (typeof window === "undefined") return;
  if (session) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

function readSession(): AuthSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    if (
      !parsed.accessToken ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt <= Date.now()
    ) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function scheduleRefresh(session: AuthSession) {
  if (refreshTimer) clearTimeout(refreshTimer);
  if (typeof window === "undefined") return;
  const delay = Math.max(0, session.expiresAt - Date.now() - REFRESH_LEAD_MS);
  refreshTimer = setTimeout(() => {
    // Fire-and-forget; failures are handled inside refresh().
    void useAuthStore.getState().refresh();
  }, delay);
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  session: null,
  user: null,
  status: "loading",

  setSession: (session) => {
    persist(session);
    scheduleRefresh(session);
    set({
      session,
      status: "authenticated",
    });
  },

  setUser: (user) => set({ user }),

  clear: () => {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = null;
    persist(null);
    set({ session: null, user: null, status: "unauthenticated" });
  },

  hydrate: () => {
    const session = readSession();
    if (session) {
      scheduleRefresh(session);
      set({ session, status: "authenticated" });
    } else {
      set({ status: "unauthenticated" });
    }
  },

  refresh: async () => {
    // Serialize concurrent refreshes (single-use refresh token).
    if (refreshMutex) return refreshMutex;

    refreshMutex = (async () => {
      try {
        const result = await authApi.refresh();
        const session: AuthSession = {
          accessToken: result.accessToken,
          expiresAt: Date.now() + result.expiresIn * 1000,
          userId: get().session?.userId ?? "",
          roles: get().session?.roles ?? [],
        };
        get().setSession(session);
        return session;
      } catch {
        get().clear();
        return null;
      } finally {
        // Release the mutex on the next microtask so concurrent callers that
        // awaited it see the resolved value.
        queueMicrotask(() => {
          refreshMutex = null;
        });
      }
    })();

    return refreshMutex;
  },
}));

/** Access-token getter registered with the API client. */
export function getAccessToken(): string | null {
  return useAuthStore.getState().session?.accessToken ?? null;
}
