import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  viewAllHref?: string;
  viewAllLabel?: string;
  className?: string;
  /** Optional trailing control (e.g. countdown). */
  trailing?: React.ReactNode;
}

/**
 * Consistent section title row with an optional "view all" action.
 * RTL-aware: the chevron points in the inline-start direction automatically.
 */
export function SectionHeader({
  title,
  subtitle,
  viewAllHref,
  viewAllLabel = "مشاهده همه",
  className,
  trailing,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-end justify-between gap-3 px-4",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="truncate text-base font-bold tracking-tight text-foreground">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {subtitle}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {trailing}
        {viewAllHref ? (
          <Link
            href={viewAllHref}
            className="tap-highlight-transparent inline-flex items-center gap-0.5 text-xs font-medium text-accent transition-opacity active:opacity-70"
          >
            {viewAllLabel}
            <ChevronLeft className="size-4 rtl:-scale-x-0" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
