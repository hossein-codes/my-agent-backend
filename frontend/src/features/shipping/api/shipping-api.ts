import { apiClient } from "@/lib/api";
import type { Province, ShippingOption } from "@/types/domain";

export interface ShippingQuoteParams {
  province?: string;
  subtotal?: number;
  weightGrams?: number;
}

export const shippingApi = {
  methods(params: ShippingQuoteParams = {}) {
    return apiClient.get<ShippingOption[]>("/shipping/methods", {
      query: {
        province: params.province,
        subtotal: params.subtotal,
        weightGrams: params.weightGrams,
      },
    });
  },
  provinces() {
    return apiClient.get<Province[]>("/shipping/provinces");
  },
};
