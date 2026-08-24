import { SetMetadata } from '@nestjs/common';

/**
 * Rate-limit bucket definitions.
 *
 * A bucket is `{ limit, windowSeconds, scope }`:
 *   - `ip`    — per client IP (anonymous abuse: OTP bombing, scraping)
 *   - `user`  — per authenticated user (falls back to IP when anonymous)
 *   - `phone` — per phone number (OTP-specific, survives IP rotation)
 *
 * Counters live in Redis and are ephemeral by design.
 */
export interface RateLimitBucket {
  limit: number;
  windowSeconds: number;
  scope: 'ip' | 'user' | 'phone';
}

export const RATE_LIMIT_KEY = 'app:rateLimit';

export const RATE_LIMIT_BUCKETS: Record<string, RateLimitBucket> = {
  // --- auth ------------------------------------------------------------------
  // Generous enough for a real user retyping a code; tight enough to stop SMS bombing.
  'otp.request': { limit: 5, windowSeconds: 3600, scope: 'phone' },
  'otp.verify': { limit: 10, windowSeconds: 900, scope: 'phone' },
  'session.refresh': { limit: 60, windowSeconds: 900, scope: 'ip' },
  'recovery.request': { limit: 3, windowSeconds: 3600, scope: 'ip' },
  'recovery.confirm': { limit: 5, windowSeconds: 900, scope: 'ip' },

  // --- commerce --------------------------------------------------------------
  'coupon.validate': { limit: 20, windowSeconds: 600, scope: 'user' },
  'review.create': { limit: 10, windowSeconds: 3600, scope: 'user' },

  // --- payments --------------------------------------------------------------
  // Provider callbacks are legitimately bursty; limit per-IP abuse only.
  'payment.callback': { limit: 30, windowSeconds: 60, scope: 'ip' },
  'payment.initiate': { limit: 10, windowSeconds: 600, scope: 'user' },

  // --- generic ---------------------------------------------------------------
  default: { limit: 120, windowSeconds: 60, scope: 'ip' },
};

export type RateLimitBucketName = keyof typeof RATE_LIMIT_BUCKETS;

/** Attaches a named bucket to a route. */
export const RateLimit = (bucket: RateLimitBucketName | string): MethodDecorator & ClassDecorator =>
  SetMetadata(RATE_LIMIT_KEY, bucket);
