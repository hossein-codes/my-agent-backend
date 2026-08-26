"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LuminaLogo } from "@/components/layout/lumina-logo";
import { useLogin } from "@/features/auth/hooks/use-auth";
import { ApiError } from "@/lib/api";
import {
  OtpCodeInput,
  ResendCountdown,
  normalizePhone,
  phoneError,
} from "@/features/auth/components/otp-request-form";

function verifyError(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case "auth.otp_invalid":
        return "کد وارد شده نادرست است.";
      case "auth.otp_expired":
        return "کد منقضی شده است. دوباره درخواست کنید.";
      case "auth.otp_attempts_exceeded":
        return "تلاش‌های شما بیش از حد مجاز است. کد جدید بگیرید.";
      case "common.validation_error":
        return "کد ۶ رقمی را کامل وارد کنید.";
      default:
        break;
    }
  }
  return "تأیید انجام نشد. دوباره تلاش کنید.";
}

export default function VerifyPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const phone = sp.get("phone") ?? "";
  const next = sp.get("next") ?? "/";

  const { requestOtp, verifyOtp } = useLogin();
  const [code, setCode] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [resending, setResending] = React.useState(false);
  const [seconds, setSeconds] = React.useState(() =>
    Math.min(180, Math.max(0, Number(sp.get("cooldown") ?? 60) || 60)),
  );

  React.useEffect(() => {
    if (seconds <= 0) return;
    const t = setInterval(() => setSeconds((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [seconds]);

  React.useEffect(() => {
    if (!normalizePhone(phone)) {
      // Bad/deep-linked entry without a phone — restart the flow.
      router.replace("/login");
    }
  }, [phone, router]);

  const verify = React.useCallback(
    async (value?: string) => {
      const c = (value ?? code).trim();
      if (c.length !== 6 || pending) return;
      setPending(true);
      try {
        await verifyOtp({ phone, code: c, deviceName: "Web" });
        toast.success("خوش آمدید! 🎉");
        router.replace(next);
      } catch (err) {
        toast.error(verifyError(err));
        setCode("");
      } finally {
        setPending(false);
      }
    },
    [code, next, pending, phone, router, verifyOtp],
  );

  const resend = async () => {
    setResending(true);
    try {
      const res = await requestOtp(phone);
      setSeconds(Math.min(180, res.cooldownSeconds ?? 60));
      toast.success("کد جدید پیامک شد.");
    } catch (err) {
      toast.error(phoneError(err));
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col justify-center gap-7 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <LuminaLogo />
        <div>
          <h1 className="text-lg font-extrabold tracking-tight">کد تأیید را وارد کنید</h1>
          <p className="font-nums mt-1 text-xs text-muted-foreground" dir="ltr">
            {phone}
          </p>
        </div>
      </div>

      <div className="flex flex-col items-center gap-4 px-4">
        <OtpCodeInput
          value={code}
          onChange={setCode}
          onComplete={() => void verify()}
          disabled={pending}
        />

        <ResendCountdown seconds={seconds} onResend={() => void resend()} pending={resending} />

        <Button
          className="h-12 w-full rounded-full text-[15px] font-bold"
          onClick={() => void verify()}
          disabled={pending || code.length !== 6}
        >
          {pending ? "در حال بررسی…" : "ورود به لومینا"}
          {!pending ? <ChevronLeft className="size-5" aria-hidden /> : null}
        </Button>

        <button
          type="button"
          onClick={() => router.back()}
          className="text-xs text-muted-foreground active:text-foreground"
        >
          تغییر شماره موبایل
        </button>
      </div>
    </div>
  );
}
