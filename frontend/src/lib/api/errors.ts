import type { ErrorCode } from "@/types/api";

/**
 * Normalized API error.
 *
 * The backend ALWAYS responds with:
 *   { code, message, details?, requestId, timestamp }
 * and the frontend switches on `code`, never on `message`.
 *
 * Network/transport failures have no backend body, so they get the synthetic
 * code `common.network_error`.
 */
export class ApiError extends Error {
  readonly code: ErrorCode | (string & {});
  readonly status: number;
  readonly details?: unknown;
  readonly requestId?: string;
  readonly timestamp?: string;

  constructor(init: {
    code: ErrorCode | (string & {});
    message: string;
    status: number;
    details?: unknown;
    requestId?: string;
    timestamp?: string;
  }) {
    super(init.message);
    this.name = "ApiError";
    this.code = init.code;
    this.status = init.status;
    this.details = init.details;
    this.requestId = init.requestId;
    this.timestamp = init.timestamp;
  }

  /** True when the request never reached the server (offline, DNS, CORS, abort). */
  get isNetworkError(): boolean {
    return this.code === "common.network_error";
  }

  /** True when the request was aborted via AbortSignal. */
  get isAborted(): boolean {
    return this.code === "common.aborted";
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isConflict(): boolean {
    return this.status === 409;
  }

  get isValidationError(): boolean {
    return this.status === 400 || this.status === 422;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }
}

/** Class-validator field errors, when present under `details.errors`. */
export function getFieldErrors(
  error: unknown,
): Record<string, string> | undefined {
  if (!(error instanceof ApiError)) return undefined;
  const details = error.details as { errors?: unknown } | undefined;
  const raw = details?.errors;
  if (!Array.isArray(raw)) return undefined;
  // class-validator returns an array of (usually) strings; it may also contain
  // objects. We keep the first message per field when available.
  const out: Record<string, string> = {};
  for (const item of raw) {
    if (typeof item === "string") {
      out._form = item;
    } else if (item && typeof item === "object") {
      const obj = item as { property?: string; message?: string };
      if (obj.property && obj.message) out[obj.property] = obj.message;
    }
  }
  return Object.keys(out).length ? out : undefined;
}
