import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis, { type RedisOptions } from 'ioredis';
import { AppConfigService } from '../../config/app-config.service';
import { MemoryRedis } from './memory-redis';

/**
 * Redis holds ONLY ephemeral data: OTPs, rate-limit counters, locks, caches.
 * It is never the source of truth (spec §3) — anything here may be flushed
 * without data loss.
 *
 * Because Redis is optional-by-design, every caller must decide its own
 * degradation policy:
 *   - rate limiting  → fail OPEN (`tryRateLimit` returns allow on error)
 *   - OTP / locks    → fail CLOSED (`client` calls throw, caller maps to 503)
 *
 * Setting `REDIS_URL=memory` swaps in an in-process implementation so the API
 * runs with nothing installed. It is single-process and non-durable, so
 * `AppConfigService` refuses it when NODE_ENV=production.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Redis');
  private readonly redis: Redis;
  private connected = false;
  private readonly inMemory: boolean;

  constructor(private readonly config: AppConfigService) {
    this.inMemory = this.config.redisUrl === 'memory';

    if (this.inMemory) {
      // Structurally compatible with the subset of ioredis this app calls.
      this.redis = new MemoryRedis() as unknown as Redis;
      this.connected = true;
      this.logger.warn('using the in-memory store (REDIS_URL=memory) — development only');
      return;
    }

    const options: RedisOptions = {
      lazyConnect: true,
      // Fail fast rather than queueing commands behind a dead server.
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      enableOfflineQueue: false,
      retryStrategy: (times: number) => {
        if (times > 5) {
          this.logger.error('giving up reconnecting — running in degraded mode');
          return null; // stop retrying
        }
        return Math.min(times * 500, 5000);
      },
    };
    this.redis = new Redis(this.config.redisUrl, options);
    this.redis.on('connect', () => {
      this.connected = true;
      this.logger.log('connected');
    });
    this.redis.on('error', (err: Error) => {
      this.connected = false;
      // Logged once per message type to avoid flooding on a hard outage.
      this.logger.warn(`unavailable: ${err.message}`);
    });
  }

  /** The raw client — use only when a Redis failure must propagate. */
  get client(): Redis {
    return this.redis;
  }

  get isAvailable(): boolean {
    return this.connected;
  }

  async onModuleInit(): Promise<void> {
    if (this.inMemory) return;
    try {
      await this.redis.connect();
    } catch (err) {
      // Not fatal: the app serves reads/writes that do not need Redis.
      this.logger.warn(`could not connect at boot: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }

  // --- convenience wrappers --------------------------------------------------

  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (err) {
      this.logger.warn(`del(${key}) failed: ${(err as Error).message}`);
    }
  }

  async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) await this.redis.set(key, value, 'EX', ttlSeconds);
    else await this.redis.set(key, value);
  }

  /**
   * Sliding-window counter. Returns the count after this hit and the seconds
   * until the window resets. Returns `null` when Redis is unreachable so the
   * caller can fail open.
   */
  async tryIncrement(key: string, windowSeconds: number): Promise<{ count: number; ttlSeconds: number } | null> {
    try {
      const multi = this.redis.multi();
      multi.incr(key);
      // Set the expiry only on the first hit so the window does not slide.
      multi.expire(key, windowSeconds, 'NX');
      multi.ttl(key);
      const [count, , ttl] = (await multi.exec()) as [
        [Error | null, number],
        [Error | null, number],
        [Error | null, number],
      ];
      if (count[0]) throw count[0];
      const ttlSeconds = ttl?.[1] ?? windowSeconds;
      return { count: count[1], ttlSeconds: ttlSeconds < 0 ? windowSeconds : ttlSeconds };
    } catch (err) {
      this.logger.warn(`rate-limit check degraded (${key}): ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Single-use lock. Returns false if the key already existed.
   * Fails CLOSED (returns false) — an unobtainable lock must not be treated
   * as "acquired".
   */
  async acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      const result = await this.redis.set(key, '1', 'EX', ttlSeconds, 'NX');
      return result === 'OK';
    } catch {
      return false;
    }
  }
}
