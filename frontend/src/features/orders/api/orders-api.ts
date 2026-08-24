import { apiClient } from "@/lib/api";
import type { Paginated, PaginationQuery } from "@/types/api";
import type { OrderDetail, OrderListItem } from "@/types/domain";

export interface OrderListQuery extends PaginationQuery {
  status?: string;
}

export const ordersApi = {
  list(query: OrderListQuery = {}) {
    return apiClient.get<Paginated<OrderListItem>>("/orders", { query });
  },
  get(id: string) {
    return apiClient.get<OrderDetail>(`/orders/${id}`);
  },
  cancel(id: string, reason?: string) {
    return apiClient.post<{ cancelled: boolean; status: string }>(
      `/orders/${id}/cancel`,
      { reason },
    );
  },
};
