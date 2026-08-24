"use client";

import * as React from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";

interface ErrorStateProps {
  error?: unknown;
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}

/**
 * Consistent inline error panel. Understands ApiError: shows a friendly
 * message and the request id when available for support.
 */
export function ErrorState({
  error,
  title = "خطایی پیش آمد",
  description,
  onRetry,
  className,
}: ErrorStateProps) {
  let message = description ?? "لطفاً دوباره تلاش کنید.";
  let requestId: string | undefined;

  if (error instanceof ApiError) {
    if (error.isNetworkError) {
      message = "ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی کنید.";
    } else {
      message = description ?? error.message;
    }
    requestId = error.requestId;
  } else if (error instanceof Error && !description) {
    message = error.message;
  }

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-8 text-center",
        className,
      )}
    >
      <AlertTriangle className="size-8 text-destructive" aria-hidden="true" />
      <p className="text-base font-medium">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      {requestId ? (
        <p className="font-mono text-xs text-muted-foreground/70">
          کد پیگیری: {requestId}
        </p>
      ) : null}
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCw className="size-4" />
          تلاش دوباره
        </Button>
      ) : null}
    </div>
  );
}
