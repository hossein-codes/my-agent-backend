import { Zap } from "lucide-react";
import { ProductRail } from "@/components/shared/product-rail";
import { Countdown } from "@/features/campaigns/components/countdown";
import type { ProductListItem } from "@/types/domain";

interface FlashSaleSectionProps {
  products: ProductListItem[];
  /** Real campaign end time, if one exists. Without it, no countdown shows. */
  endsAt?: string | null;
}

/**
 * Visually distinct "flash sale" rail with accent treatment and a real
 * countdown bound to an active campaign's `endsAt`. Product list comes from the
 * real catalog (on-sale items); no prices or discounts are computed client-side.
 */
export function FlashSaleSection({ products, endsAt }: FlashSaleSectionProps) {
  if (products.length === 0) return null;

  return (
    <section className="relative overflow-hidden rounded-3xl border border-accent/20 bg-gradient-to-l from-accent/10 via-surface to-surface p-4 pb-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <Zap className="size-5" fill="currentColor" />
          </span>
          <div>
            <h2 className="text-base font-bold tracking-tight">فروش ویژه</h2>
            <p className="text-xs text-muted-foreground">
              فرصت محدود تا اتمام موجودی
            </p>
          </div>
        </div>
        {endsAt ? (
          <Countdown endsAt={endsAt} className="gap-1 text-sm" />
        ) : null}
      </div>

      <div className="-mx-4">
        <ProductRail
          title=""
          products={products}
          viewAllHref="/campaigns/flash-sale"
        />
      </div>
    </section>
  );
}
