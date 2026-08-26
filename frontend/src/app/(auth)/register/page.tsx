import { Suspense } from "react";
import { LuminaLogo } from "@/components/layout/lumina-logo";
import { OtpRequestForm } from "@/features/auth/components/otp-request-form";

export default function RegisterPage() {
  return (
    <div className="flex min-h-dvh flex-col justify-center gap-8 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <LuminaLogo />
        <div>
          <h1 className="text-lg font-extrabold tracking-tight">ساخت حساب کاربری</h1>
          <p className="mt-1 text-xs leading-6 text-muted-foreground">
            فقط یک شماره موبایل کافی است — ثبت‌نام با تأیید کد انجام می‌شود.
          </p>
        </div>
      </div>

      <Suspense fallback={null}>
        <OtpRequestForm variant="register" />
      </Suspense>
    </div>
  );
}
