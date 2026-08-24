import { Injectable, Logger } from '@nestjs/common';

export interface HttpRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  /** Serialized as `application/x-www-form-urlencoded` when a string, JSON when an object. */
  body?: Record<string, unknown> | string;
  timeoutMs?: number;
}

export interface HttpResponse<T = unknown> {
  status: number;
  ok: boolean;
  data: T | null;
  raw: string;
}

/**
 * Minimal HTTP client for outbound provider calls (Zarinpal, Kavenegar, …).
 *
 * Deliberately NOT axios: the app needs exactly three things — a timeout, a
 * JSON parse that cannot throw, and a log line. Everything else is a liability.
 *
 * Every call is time-bounded so a hung provider cannot pin a request handler
 * open indefinitely.
 */
@Injectable()
export class HttpService {
  private readonly logger = new Logger('Http');
  private static readonly DEFAULT_TIMEOUT_MS = 8000;

  async request<T = unknown>(url: string, options: HttpRequestOptions = {}): Promise<HttpResponse<T>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? HttpService.DEFAULT_TIMEOUT_MS);

    const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
    let payload: string | undefined;
    if (options.body !== undefined) {
      if (typeof options.body === 'string') {
        payload = options.body;
      } else {
        payload = JSON.stringify(options.body);
        headers['Content-Type'] ??= 'application/json';
      }
    }

    try {
      const response = await fetch(url, {
        method: options.method ?? 'GET',
        headers,
        body: payload,
        signal: controller.signal,
      });
      const raw = await response.text();
      return { status: response.status, ok: response.ok, data: this.tryParse<T>(raw), raw };
    } catch (err) {
      // Timeouts and DNS failures look the same to callers: the provider is unusable.
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.warn(`request to ${url} failed: ${reason}`);
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  private tryParse<T>(raw: string): T | null {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null; // providers occasionally return HTML error pages
    }
  }
}
