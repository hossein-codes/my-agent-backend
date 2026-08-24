import * as React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Centered content width. Mobile-first: full-bleed padding on small screens,
 * capped on larger screens. No business logic.
 */
export function Container({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("mx-auto w-full max-w-5xl px-4 sm:px-6", className)}
      {...props}
    >
      {children}
    </div>
  );
}
