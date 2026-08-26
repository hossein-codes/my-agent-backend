"use client";

import * as React from "react";
import { Star, MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetTitle,
} from "@/components/ui/bottom-sheet";
import { ErrorState } from "@/components/shared/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils/cn";
import { toPersianDigits } from "@/lib/utils/format";
import { useAuth } from "@/features/auth";
import { useProductReviews, useCreateReview } from "../hooks/use-reviews";
import type { Review } from "@/types/domain";

function Stars({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("flex items-center gap-0.5", className)} aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn("size-3.5", i < value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")}
        />
      ))}
    </span>
  );
}

function friendlyError(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case "reviews.already_reviewed":
        return "شما قبلاً برای این محصول نظر ثبت کرده‌اید.";
      case "reviews.verified_purchase_required":
        return "ثبت نظر فقط برای خریداران این محصول امکان‌پذیر است.";
      case "common.forbidden":
        return "دسترسی لازم برای ثبت نظر را ندارید.";
      case "common.validation_error":
        return "امتیاز و متن نظر را کامل کنید.";
      default:
        break;
    }
  }
  return "ثبت نظر انجام نشد. دوباره تلاش کنید.";
}

function SubmitSheet({
  open,
  onOpenChange,
  productId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
}) {
  const [rating, setRating] = React.useState(5);
  const [hover, setHover] = React.useState<number | null>(null);
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const create = useCreateReview();

  const submit = () => {
    if (rating < 1) {
      toast.error("لطفاً امتیاز بدهید.");
      return;
    }
    if (body.trim().length < 5) {
      toast.error("متن نظر خیلی کوتاه است.");
      return;
    }
    create.mutate(
      { productId, rating, title: title.trim() || undefined, body: body.trim() },
      {
        onSuccess: () => {
          toast.success("نظر شما ثبت شد و پس از بررسی نمایش داده می‌شود.");
          onOpenChange(false);
          setTitle("");
          setBody("");
        },
        onError: (err) => toast.error(friendlyError(err)),
      },
    );
  };

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent className="pb-[calc(var(--sab)+1rem)]">
        <BottomSheetHeader>
          <BottomSheetTitle>ثبت نظر شما</BottomSheetTitle>
        </BottomSheetHeader>
        <div className="space-y-4 px-4 pb-4">
          <div>
            <p className="mb-2 text-xs text-muted-foreground">امتیاز شما</p>
            <div className="flex flex-row-reverse justify-end gap-1.5" dir="ltr">
              {Array.from({ length: 5 }).map((_, i) => {
                const v = i + 1;
                return (
                  <button
                    key={v}
                    type="button"
                    aria-label={`${v} ستاره`}
                    onMouseEnter={() => setHover(v)}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => setRating(v)}
                    className="p-1"
                  >
                    <Star
                      className={cn(
                        "size-8 transition-colors",
                        (hover ?? rating) >= v
                          ? "fill-amber-400 text-amber-400"
                          : "text-muted-foreground/40",
                      )}
                    />
                  </button>
                );
              })}
            </div>
          </div>
          <Input
            placeholder="عنوان (اختیاری)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            className="min-h-11"
          />
          <Textarea
            placeholder="تجربه خود از این محصول را بنویسید…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            maxLength={1000}
          />
          <Button
            className="h-12 w-full rounded-full font-bold"
            onClick={submit}
            disabled={create.isPending}
          >
            {create.isPending ? "در حال ثبت…" : "ثبت نظر"}
          </Button>
        </div>
      </BottomSheetContent>
    </BottomSheet>
  );
}

export function ProductReviewsSection({ productId }: { productId: string }) {
  const { isAuthenticated } = useAuth();
  const { data, isPending, isError, error, refetch } = useProductReviews(productId);
  const [sheetOpen, setSheetOpen] = React.useState(false);

  const reviews = (data?.items ?? []) as Review[];
  const total = data?.total ?? 0;
  const average =
    total > 0 ? reviews.reduce((s, r) => s + (r.rating ?? 0), 0) / Math.max(reviews.length, 1) : 0;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between px-4">
        <h2 className="text-base font-bold tracking-tight">
          نظرات کاربران{" "}
          {total > 0 ? (
            <span className="font-nums text-xs font-normal text-muted-foreground">
              ({toPersianDigits(total.toLocaleString("fa-IR"))})
            </span>
          ) : null}
        </h2>
        {isAuthenticated ? (
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-xs font-medium active:bg-muted"
          >
            <MessageSquarePlus className="size-4" aria-hidden />
            ثبت نظر
          </button>
        ) : null}
      </div>

      {total > 0 ? (
        <div className="mx-4 flex items-center gap-4 rounded-2xl border border-border/60 bg-surface p-4">
          <div className="flex flex-col items-center gap-1">
            <span className="font-nums text-2xl font-extrabold">
              {toPersianDigits(average.toFixed(1))}
            </span>
            <Stars value={Math.round(average)} />
          </div>
          <Separator orientation="vertical" className="h-12" />
          <p className="text-xs leading-5 text-muted-foreground">
            امتیازها از تجربه واقعی خریداران این محصول جمع‌آوری شده است.
          </p>
        </div>
      ) : null}

      {isPending ? (
        <div className="space-y-3 px-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState
          error={error}
          title="دریافت نظرات با مشکل مواجه شد."
          onRetry={() => void refetch()}
        />
      ) : total === 0 ? (
        <p className="px-4 pb-2 text-xs leading-6 text-muted-foreground">
          هنوز نظری برای این محصول ثبت نشده است. اولین نفر باشید!
        </p>
      ) : (
        <ul className="space-y-3 px-4">
          {reviews.slice(0, 5).map((r) => (
            <li key={r.id} className="rounded-2xl border border-border/60 bg-surface p-4">
              <div className="flex items-center justify-between gap-2">
                <Stars value={r.rating ?? 0} />
                {r.createdAt ? (
                  <span className="font-nums text-[11px] text-muted-foreground">
                    {new Date(r.createdAt).toLocaleDateString("fa-IR")}
                  </span>
                ) : null}
              </div>
              {r.title ? <p className="mt-2 text-sm font-bold">{r.title}</p> : null}
              {r.body ? (
                <p className="mt-1 text-xs leading-6 text-muted-foreground">{r.body}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <SubmitSheet open={sheetOpen} onOpenChange={setSheetOpen} productId={productId} />
    </section>
  );
}
