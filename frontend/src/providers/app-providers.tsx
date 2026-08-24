"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { AuthProvider } from "@/features/auth";
import { I18nProvider } from "@/lib/i18n";

/**
 * Root client-side provider tree.
 *
 * In development with NEXT_PUBLIC_API_MOCKING=enabled, mock catalog data is
 * served directly by the feature API modules (server-side), so there is no
 * client-side gate that could blank the UI while a Service Worker boots.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            gcTime: 5 * 60_000,
            retry: (failureCount, error) => {
              const status =
                typeof error === "object" && error !== null && "status" in error
                  ? (error as { status?: number }).status
                  : undefined;
              if (
                status === 401 ||
                status === 403 ||
                status === 404 ||
                status === 400 ||
                status === 422
              ) {
                return false;
              }
              return failureCount < 2;
            },
            refetchOnWindowFocus: false,
          },
          mutations: {
            retry: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        enableSystem={false}
        disableTransitionOnChange
      >
          <AuthProvider>{children}</AuthProvider>
          <Toaster
            position="top-center"
            richColors
            closeButton
            toastOptions={{ className: "font-sans" }}
          />
        </ThemeProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}
