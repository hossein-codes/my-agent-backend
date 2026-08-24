import * as React from "react";
import { cn } from "@/lib/utils/cn";

interface PageShellProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Reserve bottom space for the sticky mobile bottom nav. */
  withBottomNav?: boolean;
}

/**
 * App page wrapper. Handles mobile viewport height, safe-area insets and
 * consistent vertical padding. Desktop polish is intentionally deferred —
 * this is a mobile-first foundation.
 */
export function PageShell({
  className,
  withBottomNav = true,
  children,
  ...props
}: PageShellProps) {
  return (
    <div
      className={cn(
        "mx-auto flex min-h-dvh w-full max-w-5xl flex-col",
        withBottomNav && "pb-20 sm:pb-0",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
