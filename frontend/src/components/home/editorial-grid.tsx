import Image from "next/image";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Container } from "@/components/layout/container";

/**
 * Two-tile editorial banner linking to the two biggest shopping intents
 * (women / men). Imagery is bundled with the app — no external hotlinking.
 */
export function EditorialGrid() {
  return (
    <Container>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link
          href="/categories/women"
          className="group relative block aspect-[16/9] overflow-hidden rounded-3xl border border-border/60"
        >
          <Image
            src="/hero/editorial-night.jpg"
            alt="کالکشن زنانه"
            fill
            loading="eager"
            sizes="(max-width: 640px) 100vw, 50vw"
            className="object-cover transition-transform duration-500 group-active:scale-[1.03]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-4">
            <div>
              <p className="text-[11px] font-medium text-white/80">کالکشن جدید</p>
              <h3 className="text-lg font-bold text-white">استایل زنانه</h3>
            </div>
            <span className="flex size-9 items-center justify-center rounded-full bg-white text-black transition-transform group-active:scale-95">
              <ChevronLeft className="size-5" aria-hidden="true" />
            </span>
          </div>
        </Link>

        <Link
          href="/categories/men"
          className="group relative block aspect-[16/9] overflow-hidden rounded-3xl border border-border/60"
        >
          <Image
            src="/hero/editorial-dark.jpg"
            alt="کالکشن مردانه"
            fill
            loading="eager"
            sizes="(max-width: 640px) 100vw, 50vw"
            className="object-cover transition-transform duration-500 group-active:scale-[1.03]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-4">
            <div>
              <p className="text-[11px] font-medium text-white/80">منتخب فصل</p>
              <h3 className="text-lg font-bold text-white">استایل مردانه</h3>
            </div>
            <span className="flex size-9 items-center justify-center rounded-full bg-white text-black transition-transform group-active:scale-95">
              <ChevronLeft className="size-5" aria-hidden="true" />
            </span>
          </div>
        </Link>
      </div>
    </Container>
  );
}
