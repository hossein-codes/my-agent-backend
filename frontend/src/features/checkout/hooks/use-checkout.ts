"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  checkoutApi,
  type CheckoutPreviewPayload,
  type CheckoutSubmitPayload,
} from "../api/checkout-api";
import { createIdempotencyKey } from "@/lib/utils/idempotency";

/** Preview (re-price) the cart for a province + coupon. No data is changed. */
export function useCheckoutPreview(payload: CheckoutPreviewPayload, enabled = true) {
  return useQuery({
    queryKey: ["checkout", "preview", payload],
    queryFn: () => checkoutApi.preview(payload),
    enabled: enabled && Boolean(payload.provinceName),
    staleTime: 15_000,
  });
}

export function useCheckoutSummary() {
  return useQuery({
    queryKey: ["checkout", "summary"],
    queryFn: checkoutApi.summary,
    staleTime: 30_000,
  });
}

export function useSubmitOrder() {
  return useMutation({
    mutationFn: (payload: CheckoutSubmitPayload) =>
      // Stable per-submit key; a double-click replays the same key.
      checkoutApi.submit(payload, createIdempotencyKey("order")),
  });
}

export function useInitiatePayment() {
  return useMutation({
    mutationFn: (orderId: string) =>
      checkoutApi.initiatePayment(orderId, createIdempotencyKey("pay")),
  });
}

export function useVerifyPayment() {
  return useMutation({
    mutationFn: (authority: string) => checkoutApi.verifyPayment(authority),
  });
}
