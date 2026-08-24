import { publicConfig } from "@/lib/config/env";
import { ApiError } from "./errors";
import type {
  ApiErrorBody,
  ApiRequestOptions,
  HttpMethod,
  QueryValue,
} from "./types";

/**
 * Centralized API client.
 *
 * Responsibilities:
 *   - base URL + JSON headers
 *   - bearer-token injection (access token only)
 *   - `credentials: "include"` so the HttpOnly refresh cookie is sent
 *     (the cookie is scoped to /api/v1/auth by the backend)
 *   - request/response typing
 *   - consistent error normalization (network, abort, HTTP error envelopes)
 *   - optional timeout via AbortSignal
 *
 * Business/feature code must use the feature-owned API functions
 * (e.g. `productsApi.list()`) which call this client — components must not
 * call raw fetch against backend URLs.
 */

const DEFAULT_TIMEOUT_MS = 20_000;

type AccessTokenGetter = () => string | null | undefined;
type UnauthorizedHandler = () => void;

let getToken: AccessTokenGetter = () => null;
let onUnauthorized: UnauthorizedHandler = () => {};

/** Auth module registers its token reader + 401 handler here at app startup. */
export function registerAuthAccess(impl: {
  getAccessToken: AccessTokenGetter;
  onUnauthorized?: UnauthorizedHandler;
}): void {
  getToken = impl.getAccessToken;
  onUnauthorized = impl.onUnauthorized ?? onUnauthorized;
}

interface BuildInput {
  method: HttpMethod;
  path: string;
  body?: unknown;
  options?: ApiRequestOptions;
}

function buildUrl(path: string, query?: ApiRequestOptions["query"]): string {
  const base = publicConfig.apiUrl.replace(/\/$/, "");
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${base}${normalized}`);
  if (query) {
    for (const [key, raw] of Object.entries(query)) {
      const value = raw as QueryValue;
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        for (const v of value) url.searchParams.append(key, String(v));
      } else {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

async function parseErrorBody(res: Response): Promise<ApiErrorBody | null> {
  try {
    const data = (await res.json()) as unknown;
    if (
      data &&
      typeof data === "object" &&
      typeof (data as ApiErrorBody).code === "string"
    ) {
      return data as ApiErrorBody;
    }
    return null;
  } catch {
    return null;
  }
}

async function request<T>(input: BuildInput): Promise<T> {
  const { method, path, body, options } = input;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const externalSignal = options?.signal;
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    externalSignal.addEventListener(
      "abort",
      () => controller.abort(),
      { once: true },
    );
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (body !== undefined && body !== null) {
    headers["Content-Type"] = "application/json";
  }
  if (options?.idempotencyKey) {
    headers["Idempotency-Key"] = options.idempotencyKey;
  }
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(buildUrl(path, options?.query), {
      method,
      headers,
      credentials: "include", // sends the refresh cookie to /auth/refresh
      body: body === undefined || body === null ? undefined : JSON.stringify(body),
      signal: controller.signal,
      cache: options?.cache ?? "no-store",
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError({
        code: "common.aborted",
        message: "Request aborted",
        status: 0,
      });
    }
    throw new ApiError({
      code: "common.network_error",
      message:
        "ارتباط با سرور برقرار نشد. اتصال اینترنت خود را بررسی کنید.",
      status: 0,
    });
  }
  clearTimeout(timeoutId);

  if (!res.ok) {
    const errorBody = await parseErrorBody(res);
    const code = errorBody?.code ?? statusToCode(res.status);
    const message = errorBody?.message ?? statusToMessage(res.status);
    const error = new ApiError({
      code,
      message,
      status: res.status,
      details: errorBody?.details,
      requestId: errorBody?.requestId ?? res.headers.get("x-request-id") ?? undefined,
      timestamp: errorBody?.timestamp,
    });

    if (res.status === 401) {
      // Defer to the next tick so the thrown error still propagates.
      queueMicrotask(() => onUnauthorized());
    }
    throw error;
  }

  if (res.status === 204) return undefined as T;
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await res.json()) as T;
  }
  return undefined as T;
}

function statusToCode(status: number): string {
  switch (status) {
    case 400:
    case 422:
      return "common.validation_error";
    case 401:
      return "common.unauthorized";
    case 403:
      return "common.forbidden";
    case 404:
      return "common.not_found";
    case 409:
      return "common.conflict";
    case 429:
      return "common.rate_limited";
    case 413:
      return "common.payload_too_large";
    default:
      return status >= 500 ? "common.internal_error" : "common.validation_error";
  }
}

function statusToMessage(status: number): string {
  switch (status) {
    case 400:
      return "درخواست نامعتبر است.";
    case 401:
      return "برای ادامه باید وارد شوید.";
    case 403:
      return "به این بخش دسترسی ندارید.";
    case 404:
      return "موردی یافت نشد.";
    case 409:
      return "تداخل در وضعیت داده‌ها.";
    case 429:
      return "تعداد درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید.";
    case 413:
      return "حجم فایل بیشتر از حد مجاز است.";
    default:
      return "خطای غیرمنتظره‌ای رخ داد.";
  }
}

export const apiClient = {
  get: <T>(path: string, options?: ApiRequestOptions) =>
    request<T>({ method: "GET", path, options }),
  post: <T>(path: string, body?: unknown, options?: ApiRequestOptions) =>
    request<T>({ method: "POST", path, body, options }),
  patch: <T>(path: string, body?: unknown, options?: ApiRequestOptions) =>
    request<T>({ method: "PATCH", path, body, options }),
  put: <T>(path: string, body?: unknown, options?: ApiRequestOptions) =>
    request<T>({ method: "PUT", path, body, options }),
  delete: <T>(path: string, options?: ApiRequestOptions) =>
    request<T>({ method: "DELETE", path, options }),
};

/** Re-export for feature API modules. */
export { ApiError };
export type { ApiErrorBody };
