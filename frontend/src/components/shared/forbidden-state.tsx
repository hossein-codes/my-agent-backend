import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ForbiddenStateProps {
  title?: string;
  description?: string;
  loginHref?: string;
}

/** 403 — authenticated but not authorized. Never exposes backend details. */
export function ForbiddenState({
  title = "دسترسی ندارید",
  description = "برای مشاهده این صفحه اجازه‌ی دسترسی ندارید.",
  loginHref = "/login",
}: ForbiddenStateProps) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <LockKeyhole className="size-7" />
      </div>
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="max-w-xs text-sm text-muted-foreground">{description}</p>
      <div className="mt-2 flex gap-2">
        <Button asChild variant="outline">
          <Link href="/">بازگشت به خانه</Link>
        </Button>
        <Button asChild>
          <Link href={loginHref}>ورود</Link>
        </Button>
      </div>
    </div>
  );
}
