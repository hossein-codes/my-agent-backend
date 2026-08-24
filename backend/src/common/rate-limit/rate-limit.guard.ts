import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AppError } from '../errors/app-error';
import { ErrorCodes } from '../errors/error-codes';
import { RedisService } from '../../shared/redis/redis.service';
import { RATE_LIMIT_BUCKETS, RATE_LIMIT_KEY, type RateLimitBucket } from './rate-limits';

/**
 * Fixed-window rate limiter backed by Redis.
 *
 * Degradation policy is deliberate: if Redis is unreachable the request is
 * ALLOWED (fail open) and the incident is logged. Rate limiting is an abuse
 * control, not an authorization control — taking the whole storefront down
 * because a cache is offline is the worse failure.
 *
 * Routes that must never be unlimited (OTP issuance) additionally enforce
 * their own limits in the service layer, where failure is closed.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger('RateLimit');

  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const bucketName = this.reflector.getAllAndOverride<string>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!bucketName) return true;

    const bucket: RateLimitBucket | undefined = RATE_LIMIT_BUCKETS[bucketName];
    if (!bucket) {
      // A typo in @RateLimit() must not silently disable protection.
      this.logger.error(`unknown rate-limit bucket "${bucketName}" — denying request`);
      throw AppError.internal();
    }

    const request = context.switchToHttp().getRequest<Request & { body?: { phone?: string } }>();
    const identity = this.resolveIdentity(request, bucket.scope);
    const key = `rl:${bucketName}:${identity}`;

    const result = await this.redis.tryIncrement(key, bucket.windowSeconds);
    if (!result) return true; // Redis down → fail open (see class docs)

    if (result.count > bucket.limit) {
      this.logger.warn(`${bucketName} exceeded by ${identity} (${result.count}/${bucket.limit})`);
      throw AppError.tooManyRequests(
        `Too many requests. Try again in ${result.ttlSeconds} seconds.`,
        ErrorCodes.RATE_LIMITED,
        result.ttlSeconds,
      );
    }
    return true;
  }

  private resolveIdentity(request: Request & { body?: { phone?: string } }, scope: RateLimitBucket['scope']): string {
    if (scope === 'user' && request.user?.userId) return `u:${request.user.userId}`;
    if (scope === 'phone' && request.body?.phone) return `p:${request.body.phone}`;
    return `i:${this.clientIp(request)}`;
  }

  /**
   * Uses Express's `request.ip`, which already honours `x-forwarded-for`
   * ONLY when `trust proxy` is configured (see `app.setup.ts`). Reading the
   * header directly here would let any client spoof its way past the limit.
   */
  private clientIp(request: Request): string {
    return request.ip || request.socket?.remoteAddress || 'unknown';
  }
}
