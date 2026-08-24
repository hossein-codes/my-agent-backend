import { HeroCampaign, type HeroSlide } from "@/components/home/hero-campaign";
import { CategoryRail } from "@/features/categories/components/category-rail";
import { PromoHighlights } from "@/components/home/promo-highlights";
import { ProductRail } from "@/components/shared/product-rail";
import { FlashSaleSection } from "@/components/home/flash-sale-section";
import {
  HeroSkeleton,
  CategoryRailSkeleton,
  ProductRailSkeleton,
  PromoGridSkeleton,
} from "@/components/home/home-skeletons";
import { getHomeData } from "./home-data";
import { Suspense } from "react";

// Home is public, cacheable and revalidated every minute. Individual section
// failures are caught in getHomeData so the page never fully collapses.
export const revalidate = 60;

// Editorial hero imagery is shipped with the app (no external hotlinking).
const HERO_SLIDES: HeroSlide[] = [
  {
    key: "fw-editorial",
    title: "کالکشن پاییز ۱۴۰۵",
    subtitle: "تازه رسیده",
    ctaLabel: "مشاهده کالکشن",
    href: "/campaigns/fw-collection",
    image: "/hero/editorial-dark.jpg",
  },
  {
    key: "night-edit",
    title: "استایل شبانه، انتخاب ویژه",
    subtitle: "ادیتوریال",
    ctaLabel: "خرید کنید",
    href: "/categories/evening",
    image: "/hero/editorial-night.jpg",
  },
];

export default async function HomePage() {
  const data = getHomeData();

  return (
    <main className="flex flex-col gap-7 pb-4 pt-1">
      <Suspense fallback={<HeroSkeleton />}>
        <HeroSection data={data} />
      </Suspense>

      <Suspense fallback={<CategoryRailSkeleton />}>
        <CategorySection data={data} />
      </Suspense>

      <Suspense fallback={<PromoGridSkeleton />}>
        <PromoHighlights />
      </Suspense>

      <Suspense fallback={<ProductRailSkeleton />}>
        <FeaturedSection data={data} />
      </Suspense>

      <Suspense fallback={<ProductRailSkeleton count={4} />}>
        <FlashSection data={data} />
      </Suspense>

      <Suspense fallback={<ProductRailSkeleton />}>
        <NewArrivalsSection data={data} />
      </Suspense>
    </main>
  );
}

// Section components resolve the shared data promise independently so React can
// stream them as each part of getHomeData resolves.

async function HeroSection({
  data,
}: {
  data: ReturnType<typeof getHomeData>;
}) {
  const resolved = await data;
  return <HeroCampaign slides={HERO_SLIDES} campaigns={resolved.campaigns} />;
}

async function CategorySection({
  data,
}: {
  data: ReturnType<typeof getHomeData>;
}) {
  const resolved = await data;
  return <CategoryRail categories={resolved.categories} className="pt-1" />;
}

async function FeaturedSection({
  data,
}: {
  data: ReturnType<typeof getHomeData>;
}) {
  const resolved = await data;
  if (resolved.featured.length === 0) return null;
  return (
    <ProductRail
      title="پرفروش‌ترین‌ها"
      subtitle="منتخب مشتریان"
      viewAllHref="/products?sort=popular"
      products={resolved.featured}
    />
  );
}

async function FlashSection({
  data,
}: {
  data: ReturnType<typeof getHomeData>;
}) {
  const resolved = await data;
  if (resolved.onSale.length === 0) return null;
  // Use the first active campaign with an end time for the countdown; if none
  // exists (or there's no end date) the countdown is simply omitted.
  const liveCampaign = resolved.campaigns.find((c) => c.endsAt);
  return (
    <div className="px-4">
      <FlashSaleSection
        products={resolved.onSale}
        endsAt={liveCampaign?.endsAt}
      />
    </div>
  );
}

async function NewArrivalsSection({
  data,
}: {
  data: ReturnType<typeof getHomeData>;
}) {
  const resolved = await data;
  if (resolved.newest.length === 0) return null;
  return (
    <ProductRail
      title="تازه رسیده‌ها"
      subtitle="جدیدترین کالکشن‌ها"
      viewAllHref="/products?sort=newest"
      products={resolved.newest}
    />
  );
}
