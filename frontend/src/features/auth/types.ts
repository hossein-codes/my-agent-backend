import type { CurrentUser } from "@/types/domain";

export type DeviceKind = "WEB" | "ANDROID" | "IOS";

export interface AuthSession {
  accessToken: string;
  /** Epoch ms when the access token expires. */
  expiresAt: number;
  userId: string;
  roles: string[];
}

export interface AuthState {
  session: AuthSession | null;
  user: CurrentUser | null;
  status: "loading" | "authenticated" | "unauthenticated";
}

export interface OtpRequestResult {
  sent: boolean;
  expiresIn: number;
  cooldownSeconds?: number;
}
