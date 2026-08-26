"use client";

import * as React from "react";
import Link from "next/link";
import {
  ChevronLeft,
  Minus,
  PackageX,
  Ruler,
  ShoppingBag,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ErrorState } from "@/components/shared/error-state";
import { PriceDisplay } from "@/components/shared/price-display";
import { ProductRail } from "@/components/shared/product-rail";
import { useProduct } from "../hooks/use-products";
import { useCartMutations } from "@/features/cart";
import { useWishlistIds, useWishlistMutations } from "@/features/wishlist";
import { ProductGallery } from "./product-gallery";
import { SizeGuideSheet } from "./size-guide-sheet";
import { ProductReviewsSection } from "@/features/reviews/components/product-reviews";
import { cn } from "@/lib/utils/cn";
import { toPersianDigits, colorNameFa } from "@/lib/utils/format";

export function ProductDetailView({ slug }: { slug: string }) {
  const { data: p, isPending, isError, error, refetch } = useProduct(slug);
  const { addItem } = useCartMutations();
  const wishlistIds = useWishlistIds();
  const { add: addWish, remove: removeWish } = useWishlistMutations();
  const [colorId, setColorId] = React.useState<string | null>(null);
  const [sizeId, setSizeId] = React.useState<string | null>(null);
  const [guideOpen, setGuideOpen] = React.useState(false);

  // Default selections: first in-stock color (adjusted during render when the
  // product loads — no effect cascades). Single-size products auto-select.
  const [loadedFor, setLoadedFor] = React.useState<string | null>(null);
  if (p && loadedFor !== p.id) {
    setLoadedFor(p.id);
    const firstColor = p.options.colors.find((c) => c.hasStock) ?? p.options.colors[0];
    setColorId(firstColor?.id ?? null);
    if (p.options.sizes.length === 1) setSizeId(p.options.sizes[0]?.id ?? null);
  }

  if (isPending) return <DetailSkeleton />;
  if (isError)
    return (
      <ErrorState
        error={error}
        title="این محصول در دسترس نیست."
        description="ممکن است حذف شده باشد. از لیست محصولات انتخاب کنید."
        onRetry={() => void refetch()}
        className="py-20"
      />
    );
  if (!p) return null;

  const sizesForColor = p.options.sizes.filter((s) => {
    if (!colorId) return true;
    // A size is offered for the selected color if some variant matches both.
    return p.variants.some(
      (v) => v.colorId === colorId && v.sizeId === s.id && v.available > 0,
    );
  });
  const anyStockForColor = p.variants.some(
    (v) => (!colorId || v.colorId === colorId) && v.available > 0,
  );

  const variant = p.variants.find(
    (v) => v.colorId === colorId && (p.options.sizes.length <= 1 || v.sizeId === sizeId),
  );
  const selected =
    variant && variant.available > 0
      ? variant
      : p.variants.find((v) => v.colorId === colorId && v.available > 0);

  const price = selected?.price ?? null;
  const wished = wishlistIds.has(p.id);
  const numericSizes = p.options.sizes.some((s) => /^\d+$/.test(s.label));
  const relatedCategory = p.categories[0]?.slug;

  const addToCart = () => {
    if (!selected) {
      toast.error("این ترکیب رنگ/سایز فعلاً موجود نیست.");
      return;
    }
    if (p.options.sizes.length > 1 && !sizeId) {
      toast.error("لطفاً سایز را انتخاب کنید.");
      return;
    }
    addItem.mutate(
      { variantId: selected.id, quantity: 1 },
      {
        onSuccess: () => toast.success("به سبد خرید اضافه شد.", {
          action: { label: "مشاهده سبد", onClick: () => (window.location.href = "/cart") },
        }),
        onError: () => toast.error("افزودن به سبد انجام نشد. دوباره تلاش کنید."),
      },
    );
  };

  return (
    <div className="pb-24">
      <ProductGallery media={p.media} alt={p.name} />

      {/* Title block */}
      <div className="space-y-2 px-4 pt-4">
        {p.categories[0] ? (
          <nav aria-label="مسیر دسته" className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Link href="/products" className="active:text-foreground">محصولات</Link>
            <ChevronLeft className="size-3" aria-hidden />
            <Link
              href={`/categories/${p.categories[0].slug}`}
              className="active:text-foreground"
            >
              {p.categories[0].name}
            </Link>
          </nav>
        ) : null}
        {p.brand ? (
          <Link
            href={{ pathname: "/products", query: { brands: p.brand.slug } }}
            className="inline-block text-xs font-medium text-accent"
          >
            {p.brand.name}
          </Link>
        ) : null}
        <h1 className="text-lg font-extrabold leading-7 tracking-tight">{p.name}</h1>
      </div>

      {/* Price */}
      <div className="flex items-end gap-2 px-4 pt-2">
        <PriceDisplay
          value={price?.unit ?? p.priceFrom}
          size="lg"
          className="text-xl font-extrabold"
        />
        {price?.sale !== null && price?.sale !== undefined ? (
          <PriceDisplay value={price.base} muted className="text-sm line-through" />
        ) : null}
        {price && price.discountPercent > 0 ? (
          <span className="font-nums rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-accent-foreground">
            ٪{toPersianDigits(price.discountPercent)}
          </span>
        ) : null}
      </div>

      {/* Colors */}
      {p.options.colors.length > 0 ? (
        <section className="px-4 pt-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[13px] font-bold">
              رنگ:{" "}
              <span className="font-normal text-muted-foreground">
                {colorNameFa(p.options.colors.find((c) => c.id === colorId)?.displayName)}
              </span>
            </h2>
            {!anyStockForColor ? (
              <span className="text-[11px] text-red-500">ناموجود در این رنگ</span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2.5">
            {p.options.colors.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-label={c.displayName}
                aria-pressed={c.id === colorId}
                onClick={() => {
                  setColorId(c.id);
                  if (p.options.sizes.length > 1) setSizeId(null);
                }}
                className={cn(
                  "flex size-12 items-center justify-center rounded-full border-2 transition-transform active:scale-95",
                  c.id === colorId ? "border-accent" : "border-border",
                  !c.hasStock && "opacity-40",
                )}
              >
                <span
                  className="flex size-9 items-center justify-center rounded-full border border-black/10"
                  style={{ backgroundColor: c.hexCode }}
                >
                  {!c.hasStock ? <Minus className="size-4 text-red-500" aria-hidden /> : null}
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {/* Sizes */}
      {p.options.sizes.length > 1 ? (
        <section className="px-4 pt-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[13px] font-bold">سایز</h2>
            <button
              type="button"
              onClick={() => setGuideOpen(true)}
              className="flex min-h-9 items-center gap-1 text-xs text-accent active:opacity-70"
            >
              <Ruler className="size-4" aria-hidden />
              راهنمای سایز
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {p.options.sizes.map((s) => {
              const offered = sizesForColor.some((x) => x.id === s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={s.id === sizeId}
                  disabled={!offered}
                  onClick={() => setSizeId(s.id)}
                  className={cn(
                    "font-nums min-h-11 min-w-12 rounded-xl border px-3 text-sm font-semibold transition-colors",
                    s.id === sizeId
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border bg-surface",
                    !offered && "cursor-not-allowed text-muted-foreground/40 line-through",
                  )}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
          {selected && selected.available > 0 && selected.available <= 3 ? (
            <p className="font-nums mt-2 text-[11px] font-medium text-orange-600">
              تنها {toPersianDigits(selected.available)} عدد باقی مانده است!
            </p>
          ) : null}
        </section>
      ) : null}

      {selected && selected.sku ? (
        <p className="font-nums px-4 pt-3 text-[11px] text-muted-foreground" dir="ltr">
          SKU: {selected.sku}
        </p>
      ) : null}

      <Separator className="my-5" />

      {/* Accordions */}
      <div className="px-4">
        <Accordion type="multiple" defaultValue={["desc"]}>
          <AccordionItem value="desc">
            <AccordionTrigger className="text-[13px] font-bold">توضیحات محصول</AccordionTrigger>
            <AccordionContent>
              <p className="text-xs leading-7 text-muted-foreground">
                {p.description ?? "توضیحی برای این محصول ثبت نشده است."}
              </p>
            </AccordionContent>
          </AccordionItem>
          {p.attributes.length > 0 ? (
            <AccordionItem value="specs">
              <AccordionTrigger className="text-[13px] font-bold">مشخصات</AccordionTrigger>
              <AccordionContent>
                <dl className="space-y-2.5">
                  {p.attributes.map((a) => (
                    <div key={a.slug} className="flex items-center justify-between gap-4 text-xs">
                      <dt className="text-muted-foreground">{a.name}</dt>
                      <dd className="font-medium">{a.value}</dd>
                    </div>
                  ))}
                </dl>
              </AccordionContent>
            </AccordionItem>
          ) : null}
          <AccordionItem value="shipping">
            <AccordionTrigger className="text-[13px] font-bold">ارسال و مرجوعی</AccordionTrigger>
            <AccordionContent>
              <ul className="space-y-2 text-xs leading-6 text-muted-foreground">
                <li className="flex items-start gap-2">
                  <Truck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                  ارسال ۲ تا ۵ روز کاری به سراسر کشور؛ سفارش‌های بالای ۱٫۰۰۰٫۰۰۰ تومان ارسال رایگان دارند.
                </li>
                <li className="flex items-start gap-2">
                  <PackageX className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                  تا ۷ روز پس از تحویل، در صورت عدم استفاده و سالم بودن کالا، مرجوعی پذیرفته می‌شود.
                </li>
              </ul>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      <Separator className="my-5" />

      <ProductReviewsSection productId={p.id} />

      {/* Related */}
      <RelatedRail categorySlug={relatedCategory} excludeId={p.id} />

      {/* Sticky add-to-cart */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/95 p-3 pb-[calc(var(--sab)+0.75rem)] backdrop-blur-xl sm:hidden">
        <div className="mx-auto flex max-w-md items-center gap-3">
          <div className="min-w-0 shrink-0">
            <PriceDisplay value={price?.unit ?? p.priceFrom} size="sm" className="text-base font-extrabold" />
            {price?.onSale ? (
              <PriceDisplay value={price.base} muted className="text-[11px] line-through" />
            ) : null}
          </div>
          <Button
            className="h-12 flex-1 rounded-full text-[15px] font-bold"
            onClick={addToCart}
            disabled={addItem.isPending || !anyStockForColor}
          >
            <ShoppingBag className="size-5" aria-hidden />
            {!anyStockForColor ? "ناموجود" : "افزودن به سبد"}
          </Button>
          <button
            type="button"
            aria-label={wished ? "حذف از علاقه‌مندی" : "افزودن به علاقه‌مندی"}
            aria-pressed={wished}
            onClick={() =>
              wished ? removeWish.mutate(p.id) : addWish.mutate({ productId: p.id })
            }
            className={cn(
              "flex size-12 shrink-0 items-center justify-center rounded-full border transition-colors",
              wished
                ? "border-accent bg-accent/10 text-accent"
                : "border-border bg-surface active:bg-muted",
            )}
          >
            <svg viewBox="0 0 24 24" className="size-5" fill={wished ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
            </svg>
          </button>
        </div>
      </div>
      {/* Desktop-friendly CTA (mobile is sticky) */}
      <div className="hidden px-4 pt-6 sm:block">
        <Button
          className="h-12 w-full rounded-full text-[15px] font-bold"
          onClick={addToCart}
          disabled={addItem.isPending || !anyStockForColor}
        >
          <ShoppingBag className="size-5" aria-hidden />
          {!anyStockForColor ? "ناموجود" : "افزودن به سبد خرید"}
        </Button>
      </div>

      <SizeGuideSheet
        open={guideOpen}
        onOpenChange={setGuideOpen}
        kind={numericSizes ? "numeric" : "alpha"}
      />
    </div>
  );
}

function RelatedRail({
  categorySlug,
  excludeId,
}: {
  categorySlug?: string;
  excludeId: string;
}) {
  const [related, setRelated] = React.useState<Awaited<ReturnType<typeof import("../api/products-api").productsApi.list>> | null>(null);
  React.useEffect(() => {
    if (!categorySlug) return;
    void import("../api/products-api").then(({ productsApi }) =>
      productsApi
        .list({ category: categorySlug, pageSize: 10, sort: "popular" })
        .then((r) => setRelated(r))
        .catch(() => setRelated(null)),
    );
  }, [categorySlug]);

  const items = related?.items.filter((i) => i.id !== excludeId) ?? [];
  if (items.length === 0) return null;
  return (
    <div className="pt-5">
      <ProductRail
        title="محصولات مشابه"
        subtitle="شاید بپسندید"
        products={items}
        viewAllHref={`/categories/${categorySlug}`}
      />
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="pb-10">
      <Skeleton className="aspect-square w-full rounded-none" />
      <div className="space-y-3 p-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-7 w-32" />
        <div className="flex gap-2 pt-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="size-12 rounded-full" />
          ))}
        </div>
        <div className="flex gap-2 pt-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-12 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    </div>
  );
}
