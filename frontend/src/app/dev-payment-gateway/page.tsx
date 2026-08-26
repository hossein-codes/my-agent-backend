"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CreditCard, Landmark, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatTomanWithCurrency } from "@/lib/utils/format";

/**
 * DEV-ONLY mock gateway (rendered when the backend runs PAYMENT_PROVIDER=mock).
 * Mimics a real PSP enough to exercise the full redirect/verify loop.
 * In production (zarinpal) this page is simply never reached.
 */
export default function DevPaymentGatewayPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const authority = sp.get("authority") ?? "";
  const amount = Number(sp.get("amount") ?? 0);
  const orderNumber = sp.get("order") ?? "";
  const callback = sp.get("callback") ?? "";
  const [pending, setPending] = React.useState(false);

  const go = (path: string) => {
    setPending(true);
    window.location.href = path;
  };

  if (!authority || !callback) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm font-bold">پارامترهای درگاه ناقص است.</p>
        <Button variant="outline" className="rounded-full" onClick={() => router.replace("/cart")}>
          بازگشت به سبد خرید
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-3xl border border-border/70 bg-surface p-6 shadow-lg">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">
            <Landmark className="size-6" aria-hidden />
          </span>
          <h1 className="text-base font-extrabold">درگاه پرداخت آزمایشی</h1>
          <p className="text-[11px] leading-5 text-muted-foreground">
            این درگاه فقط برای توسعه است؛ هیچ پرداخت واقعی انجام نمی‌شود.
          </p>
        </div>

        <Separator className="my-5" />

        <dl className="space-y-2.5 text-xs">
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">شماره سفارش</dt>
            <dd className="font-nums font-bold" dir="ltr">{orderNumber}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">مبلغ</dt>
            <dd className="font-nums text-sm font-extrabold text-accent">
              {formatTomanWithCurrency(amount)}
            </dd>
          </div>
        </dl>

        <Separator className="my-5" />

        <div className="flex flex-col gap-2.5">
          <Button
            className="h-12 w-full rounded-full text-[15px] font-bold"
            onClick={() => go(callback)}
            disabled={pending}
          >
            <CreditCard className="size-5" aria-hidden />
            {pending ? "در حال انتقال…" : "پرداخت و بازگشت به فروشگاه"}
          </Button>
          <Button
            variant="outline"
            className="h-11 w-full rounded-full"
            onClick={() =>
              go(`/payment-result?status=payment-failed${orderNumber ? `&order=${encodeURIComponent(orderNumber)}` : ""}`)
            }
            disabled={pending}
          >
            انصراف از پرداخت
          </Button>
        </div>

        <p className="mt-4 flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground">
          <ShieldCheck className="size-3.5" aria-hidden />
          اتصال امن · شبیه‌سازی درگاه
        </p>
      </div>
    </div>
  );
}
