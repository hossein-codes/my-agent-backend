import Link from "next/link";
import { Suspense } from "react";
import { LuminaLogo } from "@/components/layout/lumina-logo";
import { OtpRequestForm } from "@/features/auth/components/otp-request-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh flex-col justify-center gap-8 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <LuminaLogo />
        <div>
          <h1 className="text-lg font-extrabold tracking-tight">ورود | ثبت‌نام</h1>
          <p className="mt-1 text-xs leading-6 text-muted-foreground">
            با شماره موبایل وارد شوید یا در چند ثانیه حساب بسازید.
          </p>
        </div>
      </div>

      <Suspense fallback={null}>
        <OtpRequestForm variant="login" />
      </Suspense>

      <p className="px-4 text-center text-[11px] leading-6 text-muted-foreground">
        حساب دارید ولی تازه‌واردید؟ مشکلی نیست —{" "}
        <Link href="/register" className="font-medium text-accent">
          ثبت‌نام
        </Link>{" "}
        همان ورود است؛ کد را بفرستید.
      </p>
    </div>
  );
}
