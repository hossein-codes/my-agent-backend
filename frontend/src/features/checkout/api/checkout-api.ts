import { apiClient } from "@/lib/api";
import type {
  CheckoutAddress,
  CheckoutPreview,
  CheckoutSubmitResponse,
  CheckoutSummary,
  PaymentInitiateResponse,
} from "@/types/domain";

export interface CheckoutPreviewPayload {
  provinceName: string;
  couponCode?: string;
}

export interface CheckoutSubmitPayload extends CheckoutAddress {
  shippingMethodId: string;
  couponCode?: string;
}

/**
 * Checkout is the critical, backend-authoritative domain.
 *
 *   - preview  → prices the cart (changes nothing)
 *   - submit   → atomically converts cart to order; MUST carry an
 *                Idempotency-Key to survive double-clicks
 *   - initiate payment → returns a gatewayUrl to redirect to
 *
 * All totals are display-only; the submit response's numbers are binding.
 */
export const checkoutApi = {
  preview(payload: CheckoutPreviewPayload) {
    return apiClient.post<CheckoutPreview>("/checkout/preview", payload);
  },

  summary() {
    return apiClient.get<CheckoutSummary>("/checkout/summary");
  },

  submit(payload: CheckoutSubmitPayload, idempotencyKey: string) {
    return apiClient.post<CheckoutSubmitResponse>("/checkout", payload, {
      idempotencyKey,
    });
  },

  initiatePayment(orderId: string, idempotencyKey?: string) {
    return apiClient.post<PaymentInitiateResponse>(
      `/payments/orders/${orderId}/initiate`,
      undefined,
      { idempotencyKey },
    );
  },

  verifyPayment(authority: string) {
    // The redirect never confirms payment — this call does.
    return apiClient.post<{
      orderNumber: string;
      orderStatus: string;
      settled: boolean;
      alreadySettled: boolean;
    }>("/payments/verify", { authority });
  },
};
