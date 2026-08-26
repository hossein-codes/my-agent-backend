import type { PromoSlide } from "@/components/home/promo-hero-slider";

/**
 * Home hero campaign slides. The ARTWORK carries all promotional content
 * (typography, offer, CTA feel) — the slider never paints UI over it.
 *
 * Swap this list (or feed it from a CMS/campaign endpoint) without touching
 * the component: each slide configures its media, link, alt and crop focus.
 */
export const HERO_SLIDES: PromoSlide[] = [
  {
    id: "new-season",
    media: "/hero/promo-new-season.jpg",
    alt: "کالکشن جدید پاییز لومینا — New Season",
    link: "/categories/women",
    objectPosition: "center",
  },
  {
    id: "flash-sale",
    media: "/hero/promo-flash-sale.jpg",
    alt: "فروش ویژه — تا ۳۰٪ تخفیف روی منتخب محصولات",
    link: "/campaigns/flash-sale",
    objectPosition: "center",
  },
  {
    id: "evening",
    media: "/hero/promo-evening.jpg",
    alt: "کالکشن مجلسی — تازه رسیده‌های بخش زنانه",
    link: "/categories/dresses",
    objectPosition: "center top",
  },
  {
    id: "sneakers",
    media: "/hero/promo-sneakers.jpg",
    alt: "کتانی‌های جدید — ارسال رایگان بالای ۱٫۰۰۰٫۰۰۰ تومان",
    link: "/categories/sneakers",
    objectPosition: "center",
  },
];
