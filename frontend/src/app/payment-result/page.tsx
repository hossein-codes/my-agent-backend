"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Home, PackageSearch, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Post-payment landing. The backend callback has already settled the payment
 * server-side; this page only PRESENTS the outcome from its status param and
 * never trusts the redirect alone (users can also re-verify from the order
 * page, which queries the real order status).
 */
export default function PaymentResultPage() {
  const sp = useSearchParams();
  const success = sp.get("status") === "payment-success";
  const orderNumber = sp.get("order") ?? "";

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
      <div
        className={
          success
            ? "flex size-24 items-center justify-center rounded-full bg-emerald-50 text-emerald-500"
            : "flex size-24 items-center justify-center rounded-full bg-red-50 text-red-500"
        }
        aria-hidden
      >
        {success ? (
          <CheckCircle2 className="size-14" strokeWidth={1.8} />
        ) : (
          <XCircle className="size-14" strokeWidth={1.8} />
        )}
      </div>

      <div>
        <h1 className="text-xl font-extrabold tracking-tight">
          {success ? "پرداخت با موفقیت انجام شد!" : "پرداخت انجام نشد."}
        </h1>
        <p className="mt-2 max-w-xs text-xs leading-6 text-muted-foreground">
          {success
            ? "سفارش شما ثبت شد و هم‌اکنون در حال آماده‌سازی است. می‌توانید وضعیت آن را از صفحه سفارش‌ها دنبال کنید."
            : "مبلغی از حساب شما کسر نشده است. در صورت کسر وجه، حداکثر تا ۷۲ ساعت بازگشت داده می‌شود."}
        </p>
        {orderNumber ? (
          <p className="font-nums mt-3 text-sm" dir="ltr">
            {orderNumber}
          </p>
        ) : null}
      </div>

      <div className="flex w-full max-w-xs flex-col gap-2.5">
        {orderNumber ? (
          <Button asChild className="h-12 rounded-full text-[15px] font-bold">
            <Link href="/account/orders">
              <PackageSearch className="size-5" aria-hidden />
              مشاهده سفارش‌ها
            </Link>
          </Button>
        ) : null}
        <Button
          asChild
          variant={orderNumber ? "outline" : "default"}
          className="h-11 rounded-full"
        >
          <Link href="/">
            <Home className="size-5" aria-hidden />
            بازگشت به فروشگاه
          </Link>
        </Button>
      </div>
    </div>
  );
}
