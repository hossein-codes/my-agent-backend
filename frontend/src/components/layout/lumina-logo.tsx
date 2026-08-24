import Link from "next/link";
import { cn } from "@/lib/utils/cn";

interface LuminaLogoProps {
  className?: string;
  asLink?: boolean;
}

/**
 * Restrained LUMINA wordmark for the light theme. Centered in the header via a
 * 3-column grid, so side icon groups never push it off-center.
 */
export function LuminaLogo({ className, asLink = true }: LuminaLogoProps) {
  const content = (
    <span
      dir="ltr"
      className={cn(
        "inline-flex select-none items-baseline font-sans text-[1.3rem] font-extrabold uppercase leading-none tracking-[0.18em] text-foreground",
        className,
      )}
    >
      LUMIN
      <span className="text-accent" aria-hidden="true">
        A
      </span>
    </span>
  );

  if (!asLink) return content;
  return (
    <Link
      href="/"
      aria-label="LUMINA — صفحه اصلی"
      className="tap-highlight-transparent"
    >
      {content}
    </Link>
  );
}
