"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { ProductCard } from "@/features/products/components/product-card";
import type { ProductListItem } from "@/types/domain";
import { cn } from "@/lib/utils/cn";

export function ProductGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 px-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="aspect-[3/4] w-full rounded-2xl" />
          <Skeleton className="h-3.5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}

interface ProductGridProps {
  products: ProductListItem[];
  priorityFirstRow?: boolean;
  className?: string;
}

/**
 * Two-column mobile product grid. Cards fill the column (no fixed max-width
 * here, unlike the rail variant) so 320px screens still get ~150px cards.
 */
export function ProductGrid({
  products,
  priorityFirstRow = false,
  className,
}: ProductGridProps) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 px-4", className)}>
      {products.map((p, i) => (
        <ProductCard
          key={p.id}
          product={p}
          priority={priorityFirstRow && i < 2}
          className="w-full min-w-0 max-w-none"
        />
      ))}
    </div>
  );
}
