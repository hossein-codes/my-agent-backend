import { apiClient } from "@/lib/api";
import type { Paginated, PaginationQuery } from "@/types/api";

export interface NotificationItem {
  id: string;
  type: string;
  title: string | null;
  body: string | null;
  readAt: string | null;
  createdAt: string;
  [key: string]: unknown;
}

export interface NotificationPreferences {
  [key: string]: unknown;
}

export const notificationsApi = {
  list(query: PaginationQuery = {}) {
    return apiClient.get<Paginated<NotificationItem>>("/notifications", { query });
  },
  markRead(id: string) {
    return apiClient.post<unknown>(`/notifications/${id}/read`);
  },
  markAllRead() {
    return apiClient.post<unknown>("/notifications/read-all");
  },
  preferences() {
    return apiClient.get<NotificationPreferences>("/notifications/preferences");
  },
};
