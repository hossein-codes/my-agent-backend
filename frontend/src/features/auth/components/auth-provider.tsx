"use client";

import { useEffect, type ReactNode } from "react";
import { useAuthStore } from "../store/auth-store";
import { useRegisterAuthApi } from "../hooks/use-auth";

/**
 * Bootstraps the auth session on the client:
 *   1. Hydrates the access token from storage.
 *   2. Registers the API client's token getter / 401 handler.
 *
 * Server-side: renders children unchanged (no storage access).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const hydrate = useAuthStore((s) => s.hydrate);

  useRegisterAuthApi();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return <>{children}</>;
}
