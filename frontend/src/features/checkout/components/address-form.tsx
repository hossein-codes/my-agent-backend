"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { queryKeys } from "@/constants";
import { shippingApi } from "@/features/shipping/api/shipping-api";
import { addressSchema, type AddressFormValues } from "../schemas/checkout-schema";
import { cn } from "@/lib/utils/cn";

export const EMPTY_ADDRESS: AddressFormValues = {
  receiverFirstName: "",
  receiverLastName: "",
  receiverPhone: "",
  provinceName: "",
  cityName: "",
  district: "",
  postalCode: "",
  line: "",
  unit: "",
  deliveryNotes: "",
};

const FIELDS: Array<{
  name: keyof AddressFormValues;
  label: string;
  placeholder?: string;
  inputMode?: "text" | "numeric" | "tel";
  dir?: "ltr" | "rtl";
  full?: boolean;
}> = [
  { name: "receiverFirstName", label: "نام گیرنده", placeholder: "مثلاً سارا" },
  { name: "receiverLastName", label: "نام خانوادگی", placeholder: "مثلاً احمدی" },
  { name: "receiverPhone", label: "موبایل گیرنده", placeholder: "+989121234567", inputMode: "tel", dir: "ltr", full: true },
  { name: "provinceName", label: "استان" },
  { name: "cityName", label: "شهر", placeholder: "مثلاً تهران" },
  { name: "district", label: "محله (اختیاری)", full: true },
  { name: "postalCode", label: "کد پستی", placeholder: "۱۰ رقم", inputMode: "numeric", dir: "ltr" },
  { name: "unit", label: "پلاک / واحد", placeholder: "مثلاً ۱۲ / ۳" },
  { name: "line", label: "نشانی کامل", placeholder: "خیابان، کوچه، بن‌بست…", full: true },
];

export function AddressForm({
  value,
  onChange,
  errors,
  defaultPhone,
}: {
  value: AddressFormValues;
  onChange: (v: AddressFormValues) => void;
  errors: Partial<Record<keyof AddressFormValues, string>>;
  defaultPhone?: string;
}) {
  const provinces = useQuery({
    queryKey: queryKeys.shipping.provinces,
    queryFn: shippingApi.provinces,
    staleTime: 24 * 60 * 60_000,
  });

  const set = (patch: Partial<AddressFormValues>) => onChange({ ...value, ...patch });

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-4">
      {FIELDS.map((f) => {
        const key = f.name;
        const err = errors[key];
        const isProvince = key === "provinceName";
        return (
          <div key={f.name} className={cn("flex flex-col", f.full && "col-span-2")}>
            <Label htmlFor={`addr-${key}`} className="mb-1.5 text-xs font-bold">
              {f.label}
            </Label>
            {isProvince ? (
              <select
                id={`addr-${key}`}
                value={value.provinceName}
                onChange={(e) => set({ provinceName: e.target.value })}
                className={cn(
                  "min-h-12 rounded-xl border bg-surface px-3 text-sm",
                  err ? "border-red-400" : "border-border",
                )}
                aria-invalid={Boolean(err)}
              >
                <option value="">
                  {provinces.isPending ? "در حال بارگذاری…" : "انتخاب استان"}
                </option>
                {(provinces.data ?? []).map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            ) : key === "line" ? (
              <Textarea
                id={`addr-${key}`}
                rows={2}
                value={value.line}
                placeholder={f.placeholder}
                onChange={(e) => set({ line: e.target.value })}
                className={cn(err && "border-red-400")}
                aria-invalid={Boolean(err)}
              />
            ) : (
              <Input
                id={`addr-${key}`}
                inputMode={f.inputMode}
                dir={f.dir}
                value={String(value[key as keyof AddressFormValues] ?? "")}
                placeholder={f.placeholder}
                onChange={(e) => set({ [key]: e.target.value } as Partial<AddressFormValues>)}
                className={cn("min-h-12", err && "border-red-400", f.dir === "ltr" && "font-nums")}
                aria-invalid={Boolean(err)}
              />
            )}
            {err ? (
              <p className="mt-1 flex items-center gap-1 text-[11px] text-red-500">
                <MapPin className="size-3" aria-hidden />
                {err}
              </p>
            ) : null}
          </div>
        );
      })}

      <div className="col-span-2 flex flex-col">
        <Label htmlFor="addr-notes" className="mb-1.5 text-xs font-bold">
          توضیحات ارسال (اختیاری)
        </Label>
        <Textarea
          id="addr-notes"
          rows={2}
          value={value.deliveryNotes ?? ""}
          placeholder="مثلاً بعد از ساعت ۱۷ تماس بگیرید."
          onChange={(e) => set({ deliveryNotes: e.target.value })}
        />
      </div>

      {defaultPhone && !value.receiverPhone ? (
        <button
          type="button"
          onClick={() => set({ receiverPhone: defaultPhone })}
          className="font-nums col-span-2 -mt-1 self-start text-[11px] text-accent active:opacity-70"
          dir="ltr"
        >
          استفاده از شماره حساب من: {defaultPhone}
        </button>
      ) : null}
    </div>
  );
}

/** Validate the address; returns field errors (empty = valid). */
export function validateAddress(v: AddressFormValues): Partial<Record<keyof AddressFormValues, string>> {
  const parsed = addressSchema.safeParse(v);
  if (parsed.success) return {};
  const out: Partial<Record<keyof AddressFormValues, string>> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0] as keyof AddressFormValues;
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
