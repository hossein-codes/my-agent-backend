import { Skeleton } from "@/components/ui/skeleton";

/** Progressive loaders shown while Home sections fetch. No full-page spinner. */

export function HeroSkeleton() {
  return (
    <div className="px-4 pt-4">
      <Skeleton className="aspect-[16/10] w-full rounded-3xl" />
    </div>
  );
}

export function CategoryRailSkeleton() {
  return (
    <div className="flex gap-4 overflow-hidden px-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex w-16 shrink-0 flex-col items-center gap-2">
          <Skeleton className="size-16 rounded-full" />
          <Skeleton className="h-3 w-12 rounded" />
        </div>
      ))}
    </div>
  );
}

export function ProductRailSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="flex gap-3 overflow-hidden px-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="w-[44vw] min-w-[150px] max-w-[200px] shrink-0"
        >
          <Skeleton className="aspect-[3/4] w-full rounded-2xl" />
          <Skeleton className="mt-2.5 h-3 w-3/4 rounded" />
          <Skeleton className="mt-2 h-3.5 w-1/2 rounded" />
        </div>
      ))}
    </div>
  );
}

export function PromoGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 px-4">
      <Skeleton className="h-24 rounded-2xl" />
      <Skeleton className="h-24 rounded-2xl" />
    </div>
  );
}
