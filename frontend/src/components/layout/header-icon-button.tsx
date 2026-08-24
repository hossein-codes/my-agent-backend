"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";

interface CommonProps {
  label: string;
  className?: string;
  children: React.ReactNode;
  badge?: React.ReactNode;
}

type ButtonProps = CommonProps &
  ({ href: string; onClick?: never } | { href?: undefined; onClick: () => void });

/**
 * 44px tap target used for every header action. The visual icon can be smaller
 * while the whole area is interactive. Renders a link when `href` is given,
 * otherwise a button.
 */
export const HeaderIconButton = React.forwardRef<HTMLElement, ButtonProps>(
  function HeaderIconButton({ label, className, children, badge, ...rest }, ref) {
    const classes = cn(
      "tap-highlight-transparent relative flex size-11 items-center justify-center rounded-full text-foreground/80 transition-colors active:bg-accent-soft active:text-accent",
      className,
    );

    if ("href" in rest && rest.href) {
      return (
        <Link
          ref={ref as React.Ref<HTMLAnchorElement>}
          href={rest.href}
          aria-label={label}
          className={classes}
        >
          {children}
          {badge}
        </Link>
      );
    }

    return (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        type="button"
        aria-label={label}
        onClick={rest.onClick}
        className={classes}
      >
        {children}
        {badge}
      </button>
    );
  },
);

export function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  const display = count > 99 ? "۹۹+" : count.toLocaleString("fa-IR");
  return (
    <span
      aria-hidden="true"
      className="absolute -end-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 font-nums text-[10px] font-bold text-accent-foreground shadow-sm ring-2 ring-background"
    >
      {display}
    </span>
  );
}
