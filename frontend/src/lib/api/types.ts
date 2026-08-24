import type { ErrorCode } from "@/types/api";

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

/**
 * The one-and-only error body shape returned by the backend
 * (see AllExceptionsFilter). The frontend switches on `code`, not `message`.
 */
export interface ApiErrorBody {
  code: ErrorCode | (string & {});
  message: string;
  details?: unknown;
  requestId?: string;
  timestamp?: string;
}

export type QueryValue =
  | string
  | number
  | boolean
  | Array<string | number>
  | undefined
  | null;

export interface ApiRequestOptions {
  // Accepts feature query objects (interfaces) which TS won't structurally
  // match to an index signature; values are validated at serialization time.
  query?: object;
  signal?: AbortSignal;
  /** Idempotency-Key header (checkout, payment initiate). */
  idempotencyKey?: string;
  timeoutMs?: number;
  /** Override the default fetch cache mode. */
  cache?: RequestCache;
}

export * from "@/types/api";
