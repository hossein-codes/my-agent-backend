import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { ProductListing } from "@/features/products/components/product-listing";
import { categoriesApi } from "@/features/categories";

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
}

/** Resolve a category slug to its display name (server-side, cacheable). */
async function resolveCategory(slug: string) {
  const tree = await categoriesApi.tree().catch(() => []);
  const find = (
    nodes: Awaited<ReturnType<typeof categoriesApi.tree>>,
  ): (typeof nodes)[number] | null => {
    for (const n of nodes) {
      if (n.slug === slug) return n;
      const hit = find(n.children);
      if (hit) return hit;
    }
    return null;
  };
  return find(tree);
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { slug } = await params;
  const category = await resolveCategory(slug);
  if (!category) notFound();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 px-4 pt-2">
        <Link
          href="/categories"
          aria-label="بازگشت به دسته‌بندی‌ها"
          className="flex size-9 items-center justify-center rounded-full border border-border bg-surface active:bg-muted"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-extrabold tracking-tight">
            {category.name}
          </h1>
          <p className="font-nums text-[11px] text-muted-foreground">
            {category.productCount.toLocaleString("fa-IR")} کالا در این دسته
          </p>
        </div>
      </div>
      <Suspense fallback={null}>
        <ProductListing
          lockedCategory={category.slug}
          lockedTitle={category.name}
          includeSubcategories
        />
      </Suspense>
    </div>
  );
}
