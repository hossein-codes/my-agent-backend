import type { OrderStatus } from "@/types/domain";

/** Persian labels and tone for each order status (presentation only). */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "در انتظار پرداخت",
  PAID: "پرداخت شد",
  PROCESSING: "در حال پردازش",
  READY_TO_SHIP: "آماده ارسال",
  SHIPPED: "ارسال شد",
  DELIVERED: "تحویل شد",
  COMPLETED: "تکمیل شد",
  CANCELLED: "لغو شده",
  RETURN_REQUESTED: "درخواست مرجوعی",
  PARTIALLY_RETURNED: "بخشی مرجوع شد",
  RETURNED: "مرجوع شد",
};

export type StatusTone =
  | "neutral"
  | "warning"
  | "success"
  | "info"
  | "danger"
  | "muted";

export const ORDER_STATUS_TONE: Record<OrderStatus, StatusTone> = {
  PENDING_PAYMENT: "warning",
  PAID: "info",
  PROCESSING: "info",
  READY_TO_SHIP: "info",
  SHIPPED: "info",
  DELIVERED: "success",
  COMPLETED: "success",
  CANCELLED: "danger",
  RETURN_REQUESTED: "warning",
  PARTIALLY_RETURNED: "warning",
  RETURNED: "muted",
};

export function orderStatusLabel(status: OrderStatus): string {
  return ORDER_STATUS_LABEL[status] ?? status;
}

/** Statuses a customer can cancel (before shipping). */
export function canCancel(status: OrderStatus): boolean {
  return ["PENDING_PAYMENT", "PAID", "PROCESSING"].includes(status);
}

/** Whether the order still needs payment. */
export function isPayable(status: OrderStatus): boolean {
  return status === "PENDING_PAYMENT";
}
