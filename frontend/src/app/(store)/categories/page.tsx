import { Suspense } from "react";
import { PackageSearch } from "lucide-react";
import { CategoryRail } from "@/features/categories/components/category-rail";
import { SectionHeader } from "@/components/shared/section-header";
import { Skeleton } from "@/components/ui/skeleton";
import { categoriesApi } from "@/features/categories";

/**
 * All categories, two-level, server-rendered. Product counts come straight
 * from the API — no client state.
 */
export default async function CategoriesPage() {
  const tree = await categoriesApi
    .tree()
    .catch(() => []);

  const roots = tree.filter((c) => c.children.length > 0 || c.productCount > 0);

  return (
    <div className="flex flex-col gap-4 pb-6">
      <div className="px-4 pt-2">
        <h1 className="text-lg font-extrabold tracking-tight">دسته‌بندی‌ها</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          میان محصولات لومینا بر اساس دسته جستجو کنید.
        </p>
      </div>

      {roots.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <PackageSearch className="size-10 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">
            دسته‌بندی‌ای برای نمایش وجود ندارد.
          </p>
        </div>
      ) : (
        roots.map((root) => (
          <section key={root.id} className="flex flex-col gap-3">
            <SectionHeader
              title={root.name}
              viewAllHref={`/products?category=${root.slug}&includeSubcategories=true`}
            />
            <div
              dir="auto"
              className="no-scrollbar flex snap-x gap-3 overflow-x-auto px-4 pb-1"
            >
              {root.children.map((child) => (
                <a
                  key={child.id}
                  href={`/categories/${child.slug}`}
                  className="tap-highlight-transparent flex min-w-[128px] snap-start flex-col gap-1.5 rounded-2xl border border-border/60 bg-surface p-3.5 active:bg-surface-hover"
                >
                  <span className="truncate text-[13px] font-bold">{child.name}</span>
                  <span className="font-nums text-[11px] text-muted-foreground">
                    {child.productCount.toLocaleString("fa-IR")} کالا
                  </span>
                </a>
              ))}
            </div>
          </section>
        ))
      )}
      <Suspense fallback={null}>
        <CategoryRail categories={tree} className="pt-2" />
      </Suspense>
    </div>
  );
}

export function CategoriesSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <Skeleton className="h-7 w-40" />
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
