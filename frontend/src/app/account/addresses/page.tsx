"use client";

import * as React from "react";
import Link from "next/link";
import { MapPin, Pencil, Plus, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetTitle,
} from "@/components/ui/bottom-sheet";
import { useAuth } from "@/features/auth";
import { useSavedAddresses, type SavedAddress } from "@/features/addresses";
import {
  AddressForm,
  EMPTY_ADDRESS,
  validateAddress,
} from "@/features/checkout/components/address-form";
import type { AddressFormValues } from "@/features/checkout/schemas/checkout-schema";

const randomId = () => Math.random().toString(36).slice(2, 10);

export default function AddressesPage() {
  const { isAuthenticated, status } = useAuth();
  const { addresses, save, remove } = useSavedAddresses();
  const [editing, setEditing] = React.useState<SavedAddress | null>(null);
  const [draft, setDraft] = React.useState<AddressFormValues>(EMPTY_ADDRESS);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [errors, setErrors] = React.useState<Partial<Record<keyof AddressFormValues, string>>>({});

  if (status === "loading")
    return <div className="p-4"><div className="h-28 w-full animate-pulse rounded-2xl bg-muted" /></div>;

  if (!isAuthenticated) {
    return (
      <EmptyState
        icon={<User className="size-7" aria-hidden />}
        title="برای مدیریت آدرس‌ها وارد شوید."
        action={
          <Button asChild className="rounded-full px-6">
            <Link href="/login?next=/account/addresses">ورود / ثبت‌نام</Link>
          </Button>
        }
        className="py-24"
      />
    );
  }

  const startNew = () => {
    setEditing(null);
    setDraft(EMPTY_ADDRESS);
    setErrors({});
    setSheetOpen(true);
  };

  const startEdit = (a: SavedAddress) => {
    setEditing(a);
    const { id: _id, label: _label, ...rest } = a;
    setDraft(rest);
    setErrors({});
    setSheetOpen(true);
  };

  const confirm = () => {
    const errs = validateAddress(draft);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    const label = `${draft.provinceName} — ${draft.cityName}`;
    save({ ...draft, id: editing?.id ?? randomId(), label });
    setSheetOpen(false);
    toast.success("آدرس ذخیره شد.");
  };

  return (
    <div className="flex flex-col gap-4 pb-8">
      <div className="flex items-center justify-between px-4 pt-2">
        <h1 className="text-lg font-extrabold tracking-tight">آدرس‌های من</h1>
        <button
          type="button"
          onClick={startNew}
          className="flex min-h-9 items-center gap-1 text-xs font-bold text-accent active:opacity-70"
        >
          <Plus className="size-4" aria-hidden />
          آدرس جدید
        </button>
      </div>

      <p className="px-4 text-[11px] leading-5 text-muted-foreground">
        آدرس‌ها روی این دستگاه ذخیره می‌شوند و هنگام تسویه حساب به‌صورت خودکار پر می‌شوند.
      </p>

      {addresses.length === 0 ? (
        <EmptyState
          icon={<MapPin className="size-7" aria-hidden />}
          title="هنوز آدرسی ثبت نکرده‌اید."
          description="با افزودن آدرس، خرید بعدی سریع‌تر خواهد بود."
          action={
            <Button className="rounded-full px-6" onClick={startNew}>
              افزودن آدرس
            </Button>
          }
          className="py-16"
        />
      ) : (
        <ul className="space-y-3 px-4">
          {addresses.map((a) => (
            <li key={a.id} className="rounded-2xl border border-border/60 bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-[13px] font-bold">
                    <MapPin className="size-4 shrink-0 text-accent" aria-hidden />
                    {a.label}
                  </p>
                  <p className="mt-1.5 text-xs leading-6 text-muted-foreground">
                    {a.receiverFirstName} {a.receiverLastName} · <span className="font-nums" dir="ltr">{a.receiverPhone}</span>
                    <br />
                    {a.provinceName}، {a.cityName}
                    {a.district ? `، ${a.district}` : ""} — {a.line}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    aria-label="ویرایش آدرس"
                    onClick={() => startEdit(a)}
                    className="flex size-10 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
                  >
                    <Pencil className="size-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label="حذف آدرس"
                    onClick={() => {
                      remove(a.id);
                      toast.success("آدرس حذف شد.");
                    }}
                    className="flex size-10 items-center justify-center rounded-full text-muted-foreground active:bg-muted active:text-red-500"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <BottomSheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <BottomSheetContent className="max-h-[90dvh]">
          <BottomSheetHeader>
            <BottomSheetTitle>{editing ? "ویرایش آدرس" : "آدرس جدید"}</BottomSheetTitle>
          </BottomSheetHeader>
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <AddressForm value={draft} onChange={setDraft} errors={errors} />
          </div>
          <div className="sticky bottom-0 border-t border-border/70 bg-background/95 p-4 pb-[calc(var(--sab)+1rem)] backdrop-blur">
            <Button className="h-12 w-full rounded-full font-bold" onClick={confirm}>
              ذخیره آدرس
            </Button>
          </div>
        </BottomSheetContent>
      </BottomSheet>
    </div>
  );
}
