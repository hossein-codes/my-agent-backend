"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Phone, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLogin } from "@/features/auth/hooks/use-auth";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils/cn";
import { toPersianDigits } from "@/lib/utils/format";

/** Normalize user input to the +989xxxxxxxxx format the API expects. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, "").replace(/^98/, "");
  if (!/^9\d{9}$/.test(digits)) return null;
  return `+98${digits}`;
}

export function phoneError(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case "common.validation_error":
        return "شماره موبایل را به‌درستی وارد کنید.";
      case "common.rate_limited":
        return "تعداد درخواست‌ها زیاد است. کمی صبر کنید.";
      case "auth.otp_resend_cooldown":
        return "کد قبلی هنوز معتبر است؛ کمی بعد دوباره تلاش کنید.";
      default:
        break;
    }
  }
  return "ارسال کد انجام نشد. دوباره تلاش کنید.";
}

/**
 * Step 1 of phone auth: enter mobile → request OTP → navigate to /verify.
 * Login and register share this form — the backend creates the account on
 * first verify, so there is no separate sign-up payload.
 */
export function OtpRequestForm({ variant = "login" }: { variant?: "login" | "register" }) {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") ?? "/";
  const [phone, setPhone] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const { requestOtp } = useLogin();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizePhone(phone);
    if (!normalized) {
      toast.error("شماره موبایل را به‌درستی وارد کنید.");
      return;
    }
    setPending(true);
    try {
      const res = await requestOtp(normalized);
      toast.success("کد تأیید پیامک شد.");
      router.push(
        `/verify?phone=${encodeURIComponent(normalized)}${next !== "/" ? `&next=${encodeURIComponent(next)}` : ""}${
          res.cooldownSeconds ? `&cooldown=${res.cooldownSeconds}` : ""
        }`,
      );
    } catch (err) {
      toast.error(phoneError(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 px-4">
      <div>
        <label htmlFor="phone" className="mb-1.5 block text-[13px] font-bold">
          شماره موبایل
        </label>
        <div className="flex items-stretch overflow-hidden rounded-xl border border-border bg-surface focus-within:border-accent">
          <span
            className="font-nums flex min-h-12 items-center gap-1 border-e border-border bg-muted/40 px-3 text-sm text-muted-foreground"
            dir="ltr"
          >
          <Phone className="size-4" aria-hidden />
            +98
          </span>
          <Input
            id="phone"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="۹۱۲ ۱۲۳ ۴۵۶۷"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, "").slice(0, 10))}
            className="font-nums min-h-12 rounded-none border-0 text-base focus-visible:ring-0 focus-visible:ring-offset-0"
            dir="ltr"
            required
          />
        </div>
        <p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">
          {variant === "register"
            ? "حساب شما با اولین ورود به‌صورت خودکار ساخته می‌شود."
            : "شماره‌ای که با آن ثبت‌نام کرده‌اید را وارد کنید."}
        </p>
      </div>

      <Button
        type="submit"
        className="h-12 w-full rounded-full text-[15px] font-bold"
        disabled={pending || phone.length < 10}
      >
        {pending ? "در حال ارسال…" : "دریافت کد تأیید"}
        {!pending ? <ChevronLeft className="size-5" aria-hidden /> : null}
      </Button>

      <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
        <ShieldCheck className="size-4 text-accent" aria-hidden />
        ورود شما به معنای پذیرش قوانین و مقررات لومینا است.
      </p>
    </form>
  );
}

/** Boxed OTP code input — one field, digit-grouped display, enter-to-submit. */
export function OtpCodeInput({
  value,
  onChange,
  onComplete,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete: () => void;
  disabled?: boolean;
}) {
  const ref = React.useRef<HTMLInputElement>(null);
  return (
    <Input
      ref={ref}
      inputMode="numeric"
      autoComplete="one-time-code"
      aria-label="کد تأیید ۶ رقمی"
      value={value}
      disabled={disabled}
      onChange={(e) => {
        const v = e.target.value.replace(/[^\d]/g, "").slice(0, 6);
        onChange(v);
        if (v.length === 6) onComplete();
      }}
      className={cn(
        "font-nums h-14 rounded-2xl border-2 text-center text-2xl font-extrabold tracking-[0.6em]",
      )}
      dir="ltr"
      placeholder="------"
    />
  );
}

export function ResendCountdown({
  seconds,
  onResend,
  pending,
}: {
  seconds: number;
  onResend: () => void;
  pending: boolean;
}) {
  return seconds > 0 ? (
    <p className="font-nums text-xs text-muted-foreground">
      ارسال مجدد کد تا {toPersianDigits(seconds)} ثانیه دیگر
    </p>
  ) : (
    <button
      type="button"
      onClick={onResend}
      disabled={pending}
      className="text-xs font-bold text-accent active:opacity-70 disabled:opacity-50"
    >
      {pending ? "در حال ارسال…" : "ارسال مجدد کد"}
    </button>
  );
}
