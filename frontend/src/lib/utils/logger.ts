/**
 * Controlled logger.
 *
 * - Strips debug/info output in production.
 * - Warns/errors always surface (wired to a monitoring service later).
 * - Never log tokens, OTP codes, passwords or payment secrets.
 */
const isDev = process.env.NODE_ENV !== "production";

export const logger = {
  debug: (...args: unknown[]) => {
    if (isDev) console.debug(...args);
  },
  info: (...args: unknown[]) => {
    if (isDev) console.info(...args);
  },
  warn: (...args: unknown[]) => {
    console.warn(...args);
  },
  error: (...args: unknown[]) => {
    console.error(...args);
  },
};
