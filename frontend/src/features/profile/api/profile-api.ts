import { apiClient } from "@/lib/api";
import type { CurrentUser } from "@/types/domain";

export interface UpdateProfilePayload {
  firstName?: string;
  lastName?: string;
}

/**
 * Profile = /users/me. The full identity (phones/emails) is read via
 * `authApi.me()`; this module owns profile updates.
 */
export const profileApi = {
  get() {
    return apiClient.get<CurrentUser>("/users/me");
  },
  update(payload: UpdateProfilePayload) {
    return apiClient.patch<{ updated: boolean }>("/users/me", payload);
  },
};
