import { publicConfig, serverConfig } from "@/lib/config/env";
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

/**
 * Turn a thrown fetch error into a short, human-readable failure with a
 * matching code — so the UI can distinguish "backend is not running" from
 * "slow backend" from a real connectivity problem. Never leaks headers.
 */
function classifyNetworkFailure(err: unknown): {
  code: "common.network_error" | "common.timeout";
  message: string;
  detail: string;
} {
  const cause = (err as { cause?: { code?: string; message?: string } })?.cause;
  const causeCode = cause?.code ?? "";
  const detail = `${(err as Error)?.name ?? "Error"}${causeCode ? ` (${causeCode})` : ""}`;

  if (causeCode === "ECONNREFUSED" || causeCode === "ECONNRESET") {
    return {
      code: "common.network_error",
      message: "سرویس در دسترس نیست. لطفاً از اجرا بودن بک‌اند مطمئن شوید.",
      detail,
    };
  }
  if (
    causeCode === "ETIMEDOUT" ||
    causeCode === "UND_ERR_CONNECT_TIMEOUT" ||
    causeCode === "EAI_AGAIN"
  ) {
    return {
      code: "common.timeout",
      message: "پاسخ سرور بیش از حد انتظار طول کشید. دوباره تلاش کنید.",
      detail,
    };
  }
  return {
    code: "common.network_error",
    message: "ارتباط با سرور برقرار نشد. اتصال اینترنت خود را بررسی کنید.",
    detail,
  };
}

/** Compact, safe-to-log description of any thrown error (no headers/tokens). */
export function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    return `ApiError ${err.status} ${err.code}: ${err.message}`;
  }
  const e = err as { name?: string; message?: string; cause?: { code?: string } };
  return `${e?.name ?? "Error"}: ${e?.message ?? "unknown"}${
    e?.cause?.code ? ` (cause ${e.cause.code})` : ""
  }`;
}

let loggedBaseUrls = false;
function logEffectiveBaseUrlsOnce(): void {
  // Server-side only, once per process — makes env misconfig instantly
  // visible in the dev log without printing any secrets.
  if (loggedBaseUrls || typeof window !== "undefined") return;
  loggedBaseUrls = true;
  console.log(
    `[api] server base=${serverConfig.apiUrl} · browser base=${publicConfig.apiUrl}`,
  );
}

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
  // Server-side (SSR/RSC) fetches prefer API_BASE_URL, which may point at an
  // internal address the browser could never reach (e.g. 127.0.0.1 in dev
  // sandboxes or a private service in production). The browser always uses
  // the public URL.
  const base = (typeof window === "undefined"
    ? serverConfig.apiUrl
    : publicConfig.apiUrl
  ).replace(/\/$/, "");
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
  logEffectiveBaseUrlsOnce();

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
  const url = buildUrl(path, options?.query);
  try {
    res = await fetch(url, {
      method,
      headers,
      credentials: "include", // sends the refresh cookie to /auth/refresh
      body: body === undefined || body === null ? undefined : JSON.stringify(body),
      signal: controller.signal,
      cache: options?.cache ?? "no-store",
    });
  } catch (err) {
    clearTimeout(timeoutId);

    // Our own timer fired (the caller's signal is still alive) → timeout,
    // not a caller-side abort.
    if (err instanceof DOMException && err.name === "AbortError") {
      if (externalSignal?.aborted) {
        throw new ApiError({
          code: "common.aborted",
          message: "Request aborted",
          status: 0,
        });
      }
      if (typeof window === "undefined") {
        console.warn(`[api] TIMEOUT ${method} ${url} after ${timeoutMs}ms`);
      }
      throw new ApiError({
        code: "common.timeout",
        message: "پاسخ سرور بیش از حد انتظار طول کشید. دوباره تلاش کنید.",
        status: 0,
      });
    }

    const failure = classifyNetworkFailure(err);
    if (typeof window === "undefined") {
      // Full detail server-side (cause code, URL) — the key for debugging
      // "backend down vs proxy vs DNS" without exposing any credentials.
      console.warn(
        `[api] ${failure.code} ${method} ${url} — ${failure.detail}`,
      );
    }
    throw new ApiError({
      code: failure.code,
      message: failure.message,
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
