"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { reviewsApi, type CreateReviewPayload } from "../api/reviews-api";

export function useProductReviews(productId: string, page = 1) {
  return useQuery({
    queryKey: ["reviews", productId, page],
    queryFn: () => reviewsApi.listForProduct(productId, { page }),
    enabled: Boolean(productId),
  });
}

export function useCreateReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateReviewPayload) => reviewsApi.create(payload),
    onSuccess: (_data, variables) =>
      qc.invalidateQueries({ queryKey: ["reviews", variables.productId] }),
  });
}
