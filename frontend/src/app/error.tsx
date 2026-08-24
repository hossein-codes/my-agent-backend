"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/shared/error-state";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to the browser console for debugging; production monitoring can
    // hook here later.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <ErrorState
        title="خطای غیرمنتظره"
        description="مشکلی در بارگذاری صفحه پیش آمد."
        onRetry={reset}
      />
    </div>
  );
}
