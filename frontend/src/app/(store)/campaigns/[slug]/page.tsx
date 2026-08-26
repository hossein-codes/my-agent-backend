"use client";

import * as React from "react";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { ChevronLeft, Timer } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/error-state";
import { EmptyState } from "@/components/shared/empty-state";
import { ProductListing } from "@/features/products/components/product-listing";
import { Countdown } from "@/features/campaigns/components/countdown";

export default function CampaignPage() {
  const { slug } = useParams<{ slug: string }>();
  const [campaign, setCampaign] = React.useState<{
    name: string;
    description: string | null;
    endsAt?: string | null;
  } | null>(null);
  const [state, setState] = React.useState<"loading" | "ok" | "missing">("loading");
  const [err, setErr] = React.useState<unknown>(null);

  React.useEffect(() => {
    void import("@/features/campaigns")
      .then(({ campaignsApi }) => campaignsApi.active())
      .then((all) => {
        // The campaign list is public/active-only; a slug that is not active
        // (draft/expired) is presented as not found.
        const hit = all.find((c) => c.slug === slug) ?? null;
        setCampaign(hit);
        setState(hit ? "ok" : "missing");
      })
      .catch((e) => {
        setErr(e);
        setState("missing");
      });
  }, [slug]);

  if (state === "loading") {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[3/4] rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (err && !campaign) {
    return <ErrorState error={err} title="دریافت اطلاعات کمپین با مشکل مواجه شد." className="py-20" />;
  }

  if (!campaign) notFound();

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="flex items-center gap-2 px-4 pt-2">
        <Link
          href="/"
          aria-label="بازگشت"
          className="flex size-9 items-center justify-center rounded-full border border-border bg-surface active:bg-muted"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </Link>
        <h1 className="text-lg font-extrabold tracking-tight">{campaign.name}</h1>
      </div>

      <div className="mx-4 rounded-3xl border border-accent/25 bg-gradient-to-l from-accent/15 via-surface to-surface p-4">
        <p className="text-xs leading-6 text-muted-foreground">
          {campaign.description ?? "تخفیف‌های این کمپین روی محصولات زیر اعمال شده است."}
        </p>
        {campaign.endsAt ? (
          <div className="mt-3 flex items-center gap-2 text-xs font-bold text-accent">
            <Timer className="size-4" aria-hidden />
            <Countdown endsAt={campaign.endsAt} className="gap-1.5" />
          </div>
        ) : null}
      </div>

      <ProductListing fixedOnSale />
    </div>
  );
}
