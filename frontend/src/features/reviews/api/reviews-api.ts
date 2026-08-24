import { apiClient } from "@/lib/api";
import type { Paginated, PaginationQuery } from "@/types/api";
import type { Review } from "@/types/domain";

export interface CreateReviewPayload {
  productId: string;
  rating: number;
  title?: string;
  body?: string;
  orderItemId?: string;
  mediaAssetIds?: string[];
}

export type UpdateReviewPayload = Partial<
  Pick<CreateReviewPayload, "rating" | "title" | "body">
>;

export const reviewsApi = {
  listForProduct(productId: string, query: PaginationQuery = {}) {
    return apiClient.get<Paginated<Review>>(
      `/catalog/products/${productId}/reviews`,
      { query },
    );
  },
  create(payload: CreateReviewPayload) {
    return apiClient.post<Review>("/reviews", payload);
  },
  update(id: string, payload: UpdateReviewPayload) {
    return apiClient.post<Review>(`/reviews/${id}`, payload);
  },
};
