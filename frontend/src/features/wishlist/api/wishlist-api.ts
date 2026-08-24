import { apiClient } from "@/lib/api";
import type { Paginated, PaginationQuery } from "@/types/api";
import type { WishlistItem } from "@/types/domain";

export const wishlistApi = {
  list(query: PaginationQuery = {}) {
    return apiClient.get<Paginated<WishlistItem>>("/wishlist", { query });
  },
  add(productId: string, variantId?: string) {
    return apiClient.post<{ added: boolean }>("/wishlist", {
      productId,
      variantId,
    });
  },
  remove(productId: string) {
    return apiClient.delete<{ removed: boolean }>(
      `/wishlist/${productId}`,
    );
  },
};
