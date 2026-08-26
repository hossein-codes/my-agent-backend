import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { SectionHeader } from "@/components/shared/section-header";
import type { Brand } from "@/types/domain";

interface BrandRailProps {
  brands: Brand[];
}

/**
 * Horizontal scroll of brand chips with live product counts. Skips brands with
 * no product so the rail never shows empty shells.
 */
export function BrandRail({ brands }: BrandRailProps) {
  const withProducts = brands.filter((b) => b.productCount > 0);
  if (withProducts.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader
        title="برندهای منتخب"
        subtitle="کیفیتِ شناسنامه‌دار"
        viewAllHref="/products"
      />
      <div
        dir="auto"
        className="no-scrollbar flex snap-x gap-2.5 overflow-x-auto px-4 pb-1"
      >
        {withProducts.map((brand) => (
          <Link
            key={brand.id}
            href={{ pathname: "/products", query: { brands: brand.slug } }}
            className="group flex min-w-[132px] snap-start items-center justify-between gap-2 rounded-2xl border border-border/60 bg-surface px-4 py-3 transition-colors active:bg-surface-hover"
          >
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-bold tracking-tight">
                {brand.name}
              </span>
              <span className="font-nums block text-[11px] text-muted-foreground">
                {brand.productCount} کالا
              </span>
            </span>
            <ChevronLeft
              className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-0.5"
              aria-hidden="true"
            />
          </Link>
        ))}
      </div>
    </section>
  );
}
