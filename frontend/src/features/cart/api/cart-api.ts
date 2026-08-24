import { apiClient } from "@/lib/api";
import type { Cart, CouponValidation } from "@/types/domain";

export interface AddCartItemPayload {
  variantId: string;
  quantity: number;
}

export interface UpdateCartItemPayload {
  quantity: number;
}

/**
 * Cart is server-authoritative. Every mutation returns the fresh cart from the
 * backend (`GET /cart`) — the frontend never computes totals. The cart
 * response includes `{ items, totals: { subtotal, displayOnly: true } }`.
 */
export const cartApi = {
  get() {
    return apiClient.get<Cart>("/cart");
  },
  addItem(payload: AddCartItemPayload) {
    return apiClient.post<Cart>("/cart/items", payload);
  },
  updateItem(variantId: string, payload: UpdateCartItemPayload) {
    return apiClient.post<Cart>(`/cart/items/${variantId}`, payload);
  },
  removeItem(variantId: string) {
    return apiClient.delete<Cart>(`/cart/items/${variantId}`);
  },
  validateCoupon(code: string) {
    return apiClient.post<CouponValidation>("/cart/coupon/validate", {
      code,
    });
  },
};
