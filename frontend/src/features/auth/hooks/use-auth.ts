"use client";

import { useCallback, useEffect } from "react";
import { useAuthStore } from "../store/auth-store";
import { authApi } from "../api/auth-api";
import type { AuthSession } from "../types";
import { useQuery } from "@tanstack/react-query";

/**
 * Public auth hooks used across the app.
 *
 * `useAuth()` returns stable selectors; components subscribe only to the slice
 * they need to avoid unnecessary re-renders.
 */
export function useAuth() {
  const session = useAuthStore((s) => s.session);
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);

  const isAuthenticated = status === "authenticated" && Boolean(session);

  const hasRole = useCallback(
    (role: string) => user?.roles?.includes(role) ?? false,
    [user],
  );

  return {
    session,
    user,
    status,
    isAuthenticated,
    hasRole,
  };
}

/** Request and verify OTP, then establish a session. */
export function useLogin() {
  const setSession = useAuthStore((s) => s.setSession);

  const requestOtp = useCallback(async (phone: string) => {
    return authApi.requestOtp({ phone });
  }, []);

  const verifyOtp = useCallback(
    async (input: {
      phone: string;
      code: string;
      deviceName?: string;
    }) => {
      const result = await authApi.verifyOtp({
        phone: input.phone,
        code: input.code,
        deviceKind: "WEB",
        deviceName: input.deviceName,
      });
      const session: AuthSession = {
        accessToken: result.accessToken,
        expiresAt: Date.now() + result.expiresIn * 1000,
        userId: result.userId,
        roles: result.roles,
      };
      setSession(session);
      return result;
    },
    [setSession],
  );

  return { requestOtp, verifyOtp };
}

export function useLogout() {
  const clear = useAuthStore((s) => s.clear);
  return useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      clear();
    }
  }, [clear]);
}

/** Fetch the current user profile once authenticated (server state). */
export function useCurrentUser(enabled = true) {
  const { isAuthenticated } = useAuth();
  const setUser = useAuthStore((s) => s.setUser);

  const query = useQuery({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      const me = await authApi.me();
      setUser(me);
      return me;
    },
    enabled: enabled && isAuthenticated,
    staleTime: 5 * 60_000,
  });

  return query;
}

/**
 * Registers the API client's auth access on mount. The client calls
 * `getAccessToken()` before every request and fires `onUnauthorized` on 401,
 * which clears the session (a refresh attempt can be added by the router).
 */
export function useRegisterAuthApi(): void {
  const clear = useAuthStore((s) => s.clear);
  useEffect(() => {
    // Dynamically import to avoid pulling the store into non-client bundles.
    void import("@/lib/api").then(({ registerAuthAccess }) => {
      registerAuthAccess({
        getAccessToken: () =>
          useAuthStore.getState().session?.accessToken ?? null,
        onUnauthorized: () => {
          // If we still think we're authenticated, drop the stale session.
          if (useAuthStore.getState().session) clear();
        },
      });
    });
  }, [clear]);
}
