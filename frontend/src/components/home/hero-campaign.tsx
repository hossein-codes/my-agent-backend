"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import type { ActiveCampaign } from "@/types/domain";

export interface HeroSlide {
  key: string;
  title: string;
  subtitle?: string;
  ctaLabel: string;
  href: string;
  image: string;
  accent?: string;
}

interface HeroCampaignProps {
  slides: HeroSlide[];
  /** Real active campaigns — used only to annotate/label where useful. */
  campaigns?: ActiveCampaign[];
  autoplayMs?: number;
}

/**
 * Editorial hero carousel: touch/swipe, pagination dots, reduced-motion aware,
 * no aggressive autoplay (pauses on interaction). The first slide is
 * priority-loaded; others lazy.
 */
export function HeroCampaign({
  slides,
  autoplayMs = 6000,
}: HeroCampaignProps) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);
  const reduceMotion = usePrefersReducedMotion();

  const goTo = useCallback(
    (i: number) => setIndex((i + slides.length) % slides.length),
    [slides.length],
  );

  useEffect(() => {
    if (paused || reduceMotion || slides.length <= 1) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % slides.length), autoplayMs);
    return () => clearInterval(id);
  }, [paused, reduceMotion, slides.length, autoplayMs]);

  if (slides.length === 0) return null;

  const onTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current === null) return;
    const endX = e.changedTouches[0]?.clientX ?? 0;
    const delta = endX - touchX.current;
    // In RTL, a swipe to the left (negative) advances forward.
    if (delta > 40) goTo(index - 1);
    else if (delta < -40) goTo(index + 1);
    touchX.current = null;
  };

  return (
    <section
      className="px-4 pt-4"
      aria-roledescription="carousel"
      aria-label="کمپین‌های ویژه"
      onMouseDown={() => setPaused(true)}
      onMouseUp={() => setPaused(false)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-3xl border border-border/60 shadow-lg">
        {slides.map((slide, i) => (
          <article
            key={slide.key}
            aria-hidden={i !== index}
            className={cn(
              "absolute inset-0 transition-opacity duration-500",
              i === index ? "opacity-100" : "pointer-events-none opacity-0",
            )}
          >
            <Image
              src={slide.image}
              alt={slide.title}
              fill
              priority={i === 0}
              sizes="(max-width: 640px) 100vw, 640px"
              className="object-cover"
              placeholder="blur"
              blurDataURL="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4="
            />
            {/* Dark gradient for legibility */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10" />
            <div className="absolute inset-x-0 bottom-0 p-5 pb-6">
              {slide.subtitle ? (
                <p className="mb-1 inline-block rounded-full bg-accent/90 px-2.5 py-0.5 text-[11px] font-semibold text-accent-foreground">
                  {slide.subtitle}
                </p>
              ) : null}
              <h2 className="max-w-[80%] text-xl font-bold leading-tight text-white drop-shadow-sm sm:text-2xl">
                {slide.title}
              </h2>
              <Link
                href={slide.href}
                className="mt-3 inline-flex h-10 items-center rounded-full bg-white px-5 text-sm font-semibold text-black transition-transform active:scale-95"
              >
                {slide.ctaLabel}
              </Link>
            </div>
          </article>
        ))}

        {slides.length > 1 ? (
          <div className="absolute bottom-3 start-1/2 flex -translate-x-1/2 gap-1.5">
            {slides.map((s, i) => (
              <button
                key={s.key}
                type="button"
                aria-label={`رفتن به اسلاید ${i + 1}`}
                aria-current={i === index}
                onClick={() => goTo(i)}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === index ? "w-5 bg-white" : "w-1.5 bg-white/50",
                )}
              />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}
