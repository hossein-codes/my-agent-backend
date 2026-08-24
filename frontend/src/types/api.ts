/**
 * Canonical error codes returned by the backend.
 *
 * Mirrored from `backend/src/common/errors/error-codes.ts`. These are part of
 * the PUBLIC API contract — switch on them for localized, actionable messages.
 * Keep in sync manually; the backend treats renames as breaking changes.
 */
export const ErrorCodes = {
  // common / transport
  VALIDATION_ERROR: "common.validation_error",
  UNAUTHORIZED: "common.unauthorized",
  FORBIDDEN: "common.forbidden",
  NOT_FOUND: "common.not_found",
  CONFLICT: "common.conflict",
  RATE_LIMITED: "common.rate_limited",
  PAYLOAD_TOO_LARGE: "common.payload_too_large",
  INTERNAL: "common.internal_error",
  IDEMPOTENCY_CONFLICT: "common.idempotency_conflict",

  // client-side only (never sent by the backend)
  NETWORK_ERROR: "common.network_error",
  ABORTED: "common.aborted",

  // auth & sessions
  SESSION_EXPIRED: "auth.session_expired",
  SESSION_REVOKED: "auth.session_revoked",
  USER_BLOCKED: "auth.user_blocked",
  USER_DELETED: "auth.user_deleted",
  OTP_INVALID: "auth.otp_invalid",
  OTP_EXPIRED: "auth.otp_expired",
  OTP_ATTEMPTS_EXCEEDED: "auth.otp_attempts_exceeded",
  OTP_RESEND_COOLDOWN: "auth.otp_resend_cooldown",
  RECOVERY_TOKEN_INVALID: "auth.recovery_token_invalid",
  RECOVERY_TOKEN_EXPIRED: "auth.recovery_token_expired",
  PHONE_TAKEN: "auth.phone_taken",
  EMAIL_TAKEN: "auth.email_taken",

  // catalog / inventory
  PRODUCT_NOT_FOUND: "catalog.product_not_found",
  PRODUCT_NOT_AVAILABLE: "catalog.product_not_available",
  VARIANT_NOT_FOUND: "catalog.variant_not_found",
  INSUFFICIENT_STOCK: "inventory.insufficient_stock",
  RESERVATION_EXPIRED: "inventory.reservation_expired",

  // cart
  CART_EMPTY: "cart.empty",
  CART_ITEM_LIMIT: "cart.item_limit",
  CART_ITEM_NOT_FOUND: "cart.item_not_found",

  // coupons / pricing
  COUPON_INVALID: "coupon.invalid",
  COUPON_EXPIRED: "coupon.expired",
  COUPON_NOT_STARTED: "coupon.not_started",
  COUPON_EXHAUSTED: "coupon.exhausted",
  COUPON_MIN_SUBTOTAL: "coupon.min_subtotal_not_met",
  COUPON_NOT_APPLICABLE: "coupon.not_applicable",
  COUPON_ALREADY_USED: "coupon.already_used",

  // orders / checkout
  ORDER_NOT_FOUND: "order.not_found",
  ORDER_NOT_PAYABLE: "order.not_payable",
  ORDER_PAYMENT_EXPIRED: "order.payment_expired",
  ORDER_ALREADY_PAID: "order.already_paid",
  ORDER_NOT_CANCELLABLE: "order.not_cancellable",
  CHECKOUT_FAILED: "checkout.failed",

  // payments
  PAYMENT_FAILED: "payment.failed",
  PAYMENT_PROVIDER_ERROR: "payment.provider_error",
  PAYMENT_AMOUNT_MISMATCH: "payment.amount_mismatch",
  PAYMENT_ALREADY_SETTLED: "payment.already_settled",
  WEBHOOK_SIGNATURE_INVALID: "payment.webhook_signature_invalid",

  // returns / refunds
  RETURN_WINDOW_CLOSED: "return.window_closed",
  RETURN_NOT_ELIGIBLE: "return.not_eligible",
  REFUND_NOT_POSSIBLE: "refund.not_possible",

  // reviews
  REVIEW_DUPLICATE: "review.duplicate",
  REVIEW_PURCHASE_REQUIRED: "review.purchase_required",
  REVIEW_NOT_FOUND: "review.not_found",

  // files
  FILE_REJECTED: "file.rejected",
  FILE_TOO_LARGE: "file.too_large",
  FILE_TYPE_UNSUPPORTED: "file.type_unsupported",

  // system
  SYSTEM_FEATURE_DISABLED: "system.feature_disabled",
  SERVICE_UNAVAILABLE: "system.service_unavailable",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * Pagination envelope returned by every list endpoint.
 * Backend: `common/dto/pagination.dto.ts`.
 */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginationQuery {
  page?: number;
  pageSize?: number;
}
