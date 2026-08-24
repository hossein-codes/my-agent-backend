"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils/cn";
import { ProductCard } from "@/features/products/components/product-card";
import { SectionHeader } from "./section-header";
import type { ProductListItem } from "@/types/domain";

interface ProductRailProps {
  title: string;
  subtitle?: string;
  viewAllHref?: string;
  products: ProductListItem[];
  className?: string;
  /** Optional node rendered at the inline end of the header (e.g. countdown). */
  headerTrailing?: React.ReactNode;
  emptyText?: string;
}

/**
 * Horizontal, touch-scrollable product rail. Reveals a sliver of the next
 * card on mobile to communicate scrollability. RTL-aware via dir inheritance.
 */
export function ProductRail({
  title,
  subtitle,
  viewAllHref,
  products,
  className,
  headerTrailing,
}: ProductRailProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  if (products.length === 0) return null;

  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <SectionHeader
        title={title}
        subtitle={subtitle}
        viewAllHref={viewAllHref}
        trailing={headerTrailing}
      />
      <div
        ref={scrollRef}
        dir="auto"
        className="no-scrollbar flex snap-x gap-3 overflow-x-auto px-4 pb-1"
      >
        {products.map((p, i) => (
          <div key={p.id} className="snap-start">
            <ProductCard product={p} priority={i === 0} />
          </div>
        ))}
      </div>
    </section>
  );
}
