import { cn } from "@/lib/utils/cn";
import { ORDER_STATUS_TONE, type StatusTone } from "@/features/orders/utils/order-status";
import type { OrderStatus } from "@/types/domain";

const TONE_CLASS: Record<StatusTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  warning: "bg-amber-50 text-amber-700",
  success: "bg-emerald-50 text-emerald-600",
  info: "bg-sky-50 text-sky-700",
  danger: "bg-red-50 text-red-500",
  muted: "bg-muted text-muted-foreground/70",
};

export function StatusChip({
  status,
  label,
  className,
}: {
  status: OrderStatus;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-bold",
        TONE_CLASS[ORDER_STATUS_TONE[status]],
        className,
      )}
    >
      {label}
    </span>
  );
}
