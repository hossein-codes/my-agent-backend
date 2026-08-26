"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { toPersianDigits } from "@/lib/utils/format";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

export interface PromoSlide {
  id: string;
  /** Bundled or remote artwork (jpg/png/webp/gif). */
  media: string;
  /** Reserved for animated media decisions; static images work unchanged. */
  type?: "image" | "gif";
  /** Meaningful description — the artwork itself is the promo content. */
  alt: string;
  /** Optional destination; when present the WHOLE slide is the tap target. */
  link?: string;
  /** Per-slide crop focus, e.g. "center top" for artwork with top content. */
  objectPosition?: string;
}

interface PromoHeroSliderProps {
  slides: PromoSlide[];
  autoplay?: boolean;
  /** ms each slide stays before advancing (default 5000). */
  intervalMs?: number;
  /** ms after the last user interaction before autoplay resumes. */
  resumeDelayMs?: number;
}

/**
 * Premium mobile promotional hero carousel.
 *
 * Design contract:
 *  - the ARTWORK is the content — no text/badge/overlay is painted over it
 *  - ~91% viewport width, 200–250px tall (clamps with the viewport)
 *  - native scroll-snap: finger-following drag, momentum, smooth snap,
 *    edge resistance and correct RTL for free
 *  - subtle dot pagination BELOW the artwork with grown touch targets
 *  - autoplay pauses on interaction / off-screen / hidden tab and resumes
 *    lazily; disabled entirely for reduced-motion users
 *  - first slide priority-loads, next slide preloads, broken slides are
 *    skipped without breaking the carousel; zero slides renders nothing
 */
export function PromoHeroSlider({
  slides,
  autoplay = true,
  intervalMs = 5000,
  resumeDelayMs = 5000,
}: PromoHeroSliderProps) {
  const reduceMotion = usePrefersReducedMotion();
  const trackRef = React.useRef<HTMLDivElement>(null);
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const resumeTimer = React.useRef<number | null>(null);

  const [index, setIndex] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const [visible, setVisible] = React.useState(true);
  const [broken, setBroken] = React.useState<ReadonlySet<string>>(new Set());

  const usable = React.useMemo(
    () => slides.filter((s) => !broken.has(s.id)),
    [slides, broken],
  );
  const total = usable.length;

  const goTo = React.useCallback(
    (i: number) => {
      const el = trackRef.current;
      if (!el) return;
      const target = el.children[Math.max(0, Math.min(i, total - 1))];
      if (!(target instanceof HTMLElement)) return;
      target.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        inline: "center",
        block: "nearest",
      });
    },
    [reduceMotion, total],
  );

  // Pause on any user intent; resume quietly after a grace period.
  const noteUserInteraction = React.useCallback(() => {
    setPaused(true);
    if (resumeTimer.current !== null) window.clearTimeout(resumeTimer.current);
    resumeTimer.current = window.setTimeout(
      () => setPaused(false),
      resumeDelayMs,
    );
  }, [resumeDelayMs]);
  React.useEffect(
    () => () => {
      if (resumeTimer.current !== null) window.clearTimeout(resumeTimer.current);
    },
    [],
  );

  // Track the settled slide from the scroll position (RTL-safe: abs offset).
  const onScroll = React.useCallback(() => {
    const el = trackRef.current;
    if (!el || el.clientWidth === 0) return;
    const i = Math.round(Math.abs(el.scrollLeft) / el.clientWidth);
    setIndex((prev) => {
      const next = Math.max(0, Math.min(i, total - 1));
      return next === prev ? prev : next;
    });
  }, [total]);

  // Only autoplay while on screen; hidden tabs must not advance slides.
  React.useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => setVisible(Boolean(entry?.isIntersecting)),
      { threshold: 0.5 },
    );
    io.observe(wrapper);
    const onVisibility = () => {
      if (document.hidden) noteUserInteraction();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [noteUserInteraction]);

  // Autoplay loop — restarted on every index change, never while paused.
  React.useEffect(() => {
    if (!autoplay || reduceMotion || paused || !visible || total < 2) return;
    const t = window.setTimeout(() => goTo((index + 1) % total), intervalMs);
    return () => window.clearTimeout(t);
  }, [autoplay, reduceMotion, paused, visible, total, index, goTo, intervalMs]);

  // Keep the active dot honest when slides are skipped due to load errors
  // (adjusted during render — React's recommended pattern, no effect cascade).
  const safeIndex = Math.min(index, Math.max(0, total - 1));
  if (safeIndex !== index) setIndex(safeIndex);

  if (total === 0) return null;
  const single = total === 1;

  return (
    <div ref={wrapperRef} className="w-[91%] mx-auto">
      <div
        ref={trackRef}
        onScroll={onScroll}
        onPointerDown={noteUserInteraction}
        onWheel={noteUserInteraction}
        onTouchStart={noteUserInteraction}
        role="region"
        aria-roledescription="کاروسل"
        aria-label="بنرهای تبلیغاتی لومینا"
        className={cn(
          "no-scrollbar flex h-[clamp(200px,56vw,250px)] snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-3xl bg-muted",
          single && "snap-none overflow-hidden",
        )}
      >
        {usable.map((slide, i) => {
          const media = (
            <Image
              src={slide.media}
              alt={slide.alt}
              fill
              unoptimized={slide.type === "gif"}
              priority={i === 0}
              loading={i === 1 ? "eager" : i === 0 ? undefined : "lazy"}
              sizes="(max-width: 640px) 92vw, 512px"
              className="object-cover"
              style={{ objectPosition: slide.objectPosition ?? "center" }}
              onError={() =>
                setBroken((prev) => {
                  if (prev.has(slide.id)) return prev;
                  const next = new Set(prev);
                  next.add(slide.id);
                  return next;
                })
              }
            />
          );

          return (
            <div
              key={slide.id}
              className="relative h-full w-full shrink-0 snap-center"
              role="group"
              aria-roledescription="اسلاید"
              aria-label={`${toPersianDigits(i + 1)} از ${toPersianDigits(total)}`}
              aria-current={i === index ? "true" : undefined}
            >
              {slide.link ? (
                <Link
                  href={slide.link}
                  aria-label={slide.alt}
                  className="absolute inset-0"
                  draggable={false}
                >
                  {media}
                </Link>
              ) : (
                <div className="absolute inset-0">{media}</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pagination — below the artwork, subtle, with grown hit areas. */}
      {total > 1 ? (
        <div className="mt-2.5 flex items-center justify-center gap-0.5">
          {usable.map((slide, i) => {
            const active = i === index;
            return (
              <button
                key={slide.id}
                type="button"
                onClick={() => {
                  noteUserInteraction();
                  goTo(i);
                }}
                aria-label={`نمایش اسلاید ${toPersianDigits(i + 1)} از ${toPersianDigits(total)}`}
                aria-current={active ? "true" : undefined}
                className="flex size-8 items-center justify-center"
              >
                <span
                  aria-hidden
                  className={cn(
                    "block h-[5px] rounded-full transition-all duration-300 motion-reduce:transition-none",
                    active
                      ? "w-5 bg-accent"
                      : "w-[5px] bg-muted-foreground/30",
                  )}
                />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
