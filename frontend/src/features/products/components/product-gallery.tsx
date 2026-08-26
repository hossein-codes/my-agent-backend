"use client";

import * as React from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils/cn";
import { toPersianDigits } from "@/lib/utils/format";
import type { ProductMedia } from "@/types/domain";

interface GalleryProps {
  media: ProductMedia[];
  alt: string;
}

/**
 * Touch-first product gallery: horizontal scroll-snap carousel with dot
 * pagination, tap-to-zoom into a fullscreen swipeable viewer. RTL-aware by
 * inheriting direction; dots map to logical slide order.
 */
export function ProductGallery({ media, alt }: GalleryProps) {
  const [index, setIndex] = React.useState(0);
  const [viewerOpen, setViewerOpen] = React.useState(false);
  const trackRef = React.useRef<HTMLDivElement>(null);
  const images = media.filter((m) => (m.type ?? "IMAGE") === "IMAGE");

  const scrollTo = (i: number) => {
    const track = trackRef.current;
    if (!track) return;
    // In RTL scrollLeft is negative on most engines; normalize with sign.
    const sign = track.scrollLeft === 0 ? 1 : Math.sign(track.scrollLeft) || -1;
    track.scrollTo({ left: sign * i * track.clientWidth, behavior: "smooth" });
    setIndex(i);
  };

  const onScroll = () => {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    const pos = Math.abs(track.scrollLeft);
    setIndex(Math.round(pos / track.clientWidth));
  };

  if (images.length === 0) {
    return (
      <div className="flex aspect-square w-full items-center justify-center bg-muted text-xs text-muted-foreground">
        تصویری ثبت نشده است
      </div>
    );
  }

  return (
    <>
      <div className="relative">
        <div
          ref={trackRef}
          onScroll={onScroll}
          dir="ltr"
          className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto"
        >
          {images.map((m, i) => (
            <button
              key={`${m.url}-${i}`}
              type="button"
              onClick={() => setViewerOpen(true)}
              aria-label={`نمایش تمام‌صفحه تصویر ${toPersianDigits(i + 1)}`}
              className="relative aspect-square w-full shrink-0 snap-center overflow-hidden bg-muted"
            >
              <Image
                src={m.url}
                alt={m.alt ?? alt}
                fill
                priority={i === 0}
                sizes="100vw"
                className="object-cover"
              />
            </button>
          ))}
        </div>

        {images.length > 1 ? (
          <>
            <button
              type="button"
              onClick={() => scrollTo(Math.min(index + 1, images.length - 1))}
              aria-label="تصویر قبلی"
              className="absolute start-3 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur active:bg-black/55"
            >
              <ChevronRight className="size-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => scrollTo(Math.max(index - 1, 0))}
              aria-label="تصویر بعدی"
              className="absolute end-3 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur active:bg-black/55"
            >
              <ChevronLeft className="size-5" aria-hidden />
            </button>
            <div className="absolute bottom-3 start-0 end-0 flex items-center justify-center gap-1.5">
              {images.map((_, i) => (
                <span
                  key={i}
                  aria-hidden
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    i === index ? "w-5 bg-white" : "w-1.5 bg-white/60",
                  )}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>

      {/* Fullscreen viewer */}
      <Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
        <DialogContent
          display="fullscreen"
          className="bg-black/95 p-0 [&>button]:text-white"
        >
          <DialogTitle className="sr-only">تصاویر محصول</DialogTitle>
          <div
            dir="ltr"
            className="no-scrollbar flex h-dvh snap-x snap-mandatory items-center overflow-x-auto"
          >
            {images.map((m, i) => (
              <div key={`fs-${m.url}-${i}`} className="relative flex h-dvh w-screen shrink-0 snap-center items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={m.url}
                  alt={m.alt ?? alt}
                  className="max-h-[85dvh] w-auto max-w-full object-contain"
                />
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setViewerOpen(false)}
            aria-label="بستن"
            className="absolute end-4 top-[calc(var(--sat)+1rem)] flex size-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur"
          >
            <X className="size-5" aria-hidden />
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
}
