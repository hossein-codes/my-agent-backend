"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils/cn";

interface CountdownProps {
  /** ISO timestamp when the campaign ends. If absent, nothing renders. */
  endsAt: string | null | undefined;
  className?: string;
  /** Called once when the countdown reaches zero. */
  onExpire?: () => void;
}

// Starts false on the server/first render to avoid a hydration mismatch; flips
// in an effect (external system = browser mount).
function useIsMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return mounted;
}

function useNow(intervalMs: number) {
  // External store pattern: the store is the system clock, updated on an
  // interval. getServerSnapshot returns null so the first client paint matches
  // the server (no hydration mismatch) before the interval starts.
  return useSyncExternalStore(
    (onChange) => {
      const id = setInterval(onChange, intervalMs);
      return () => clearInterval(id);
    },
    () => Date.now(),
    () => null,
  );
}

function diff(now: number, end: number) {
  const s = Math.max(0, Math.floor((end - now) / 1000));
  return {
    h: Math.floor(s / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
    done: s === 0,
  };
}

function pad(n: number): string {
  return n.toLocaleString("fa-IR", { minimumIntegerDigits: 2 });
}

/**
 * Client-only countdown for a real campaign `endsAt`. The server renders a
 * stable placeholder (two dots) so there is no hydration mismatch; the real
 * time mounts after. Stops at zero and calls onExpire.
 */
export function Countdown({ endsAt, className, onExpire }: CountdownProps) {
  const mounted = useIsMounted();
  const now = useNow(1000);

  if (!endsAt) return null;
  const end = new Date(endsAt).getTime();
  if (Number.isNaN(end)) return null;

  if (!mounted || now === null) {
    return (
      <span
        className={cn("font-nums text-xs text-muted-foreground", className)}
        aria-hidden
      >
        --:--:--
      </span>
    );
  }

  const t = diff(now, end);
  if (t.done) {
    onExpire?.();
    return (
      <span className={cn("font-nums text-xs text-muted-foreground", className)}>
        پایان یافت
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-nums text-xs tabular-nums",
        className,
      )}
      aria-label={`${pad(t.h)} ساعت ${pad(t.m)} دقیقه ${pad(t.s)} ثانیه مانده`}
    >
      <Unit value={pad(t.h)} />
      <Sep />
      <Unit value={pad(t.m)} />
      <Sep />
      <Unit value={pad(t.s)} />
    </span>
  );
}

function Unit({ value }: { value: string }) {
  return (
    <span className="rounded-md bg-background/80 px-1.5 py-0.5 font-semibold text-foreground">
      {value}
    </span>
  );
}

function Sep() {
  return <span className="text-muted-foreground">:</span>;
}
