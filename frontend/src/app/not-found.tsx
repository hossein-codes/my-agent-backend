import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="font-nums text-5xl font-bold text-muted-foreground">۴۰۴</p>
      <h1 className="text-lg font-semibold">صفحه پیدا نشد</h1>
      <p className="max-w-xs text-sm text-muted-foreground">
        صفحه‌ای که دنبالش بودید وجود ندارد یا جابه‌جا شده است.
      </p>
      <Button asChild>
        <Link href="/">بازگشت به خانه</Link>
      </Button>
    </div>
  );
}
