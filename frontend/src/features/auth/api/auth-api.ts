import { apiClient } from "@/lib/api";
import type {
  CurrentUser,
  OtpRequestResponse,
  OtpVerifyResponse,
  RefreshResponse,
} from "@/types/domain";
import type { DeviceKind } from "../types";

export const IRAN_MOBILE_RE = /^\+989\d{9}$/;

export interface RequestOtpPayload {
  phone: string;
}

export interface VerifyOtpPayload {
  phone: string;
  code: string;
  deviceKind?: DeviceKind;
  deviceName?: string;
}

/**
 * Feature-owned auth API. Routes are relative to the /api/v1 base URL
 * configured in the central client.
 *
 * NOTE: /auth/refresh is called WITHOUT an Authorization header — it relies on
 * the HttpOnly `refresh_token` cookie, which the client always sends via
 * `credentials: "include"`. The cookie is scoped to /api/v1/auth by the
 * backend, so it is never attached to ordinary API calls.
 */
export const authApi = {
  requestOtp(payload: RequestOtpPayload) {
    return apiClient.post<OtpRequestResponse>("/auth/otp/request", payload);
  },

  verifyOtp(payload: VerifyOtpPayload) {
    return apiClient.post<OtpVerifyResponse>("/auth/otp/verify", payload);
  },

  /**
   * Rotate tokens. The refresh token is read from the HttpOnly cookie by the
   * backend; the body field is only used by native clients. On the web we
   * send an empty body.
   *
   * The backend refresh token is SINGLE-USE: two concurrent refreshes revoke
   * the whole session family. The caller (the auth store) MUST serialize
   * concurrent refreshes through a mutex.
   */
  refresh() {
    return apiClient.post<RefreshResponse>("/auth/refresh", {});
  },

  logout() {
    return apiClient.post<{ revoked: boolean }>("/auth/logout");
  },

  me() {
    return apiClient.get<CurrentUser>("/users/me");
  },
};
