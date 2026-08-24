import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';

const CACHE_PREFIX = 'ff:';
const CACHE_SECONDS = 30;

/**
 * Runtime feature flags (spec §22).
 *
 * The `FeatureFlag` table — not env, not code — is the source of truth for
 * whether a user-facing capability is on. Admins can disable reviews or
 * checkout without a deploy.
 *
 * Cached in Redis for 30s. A flag with no row is treated as DISABLED for
 * known-safe-to-disable features, so a missing seed cannot silently enable
 * something that was never intended to ship.
 */
@Injectable()
export class FeaturesService {
  private readonly logger = new Logger('Features');

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async isEnabled(key: string): Promise<boolean> {
    const cacheKey = `${CACHE_PREFIX}${key}`;
    try {
      const cached = await this.redis.client.get(cacheKey);
      if (cached !== null) return cached === '1';
    } catch {
      /* Redis down → read through to the DB */
    }

    const flag = await this.prisma.featureFlag.findUnique({ where: { key }, select: { isEnabled: true } });
    const enabled = flag?.isEnabled ?? false;

    try {
      await this.redis.client.set(cacheKey, enabled ? '1' : '0', 'EX', CACHE_SECONDS);
    } catch (err) {
      this.logger.debug(`flag cache write failed for ${key}: ${(err as Error).message}`);
    }
    return enabled;
  }

  /** All flags, for the admin toggle screen. */
  async list(): Promise<Array<{ key: string; isEnabled: boolean; description: string | null }>> {
    const rows = await this.prisma.featureFlag.findMany({ orderBy: { key: 'asc' } });
    return rows.map((r: { key: string; isEnabled: boolean; description: string | null }) => ({
      key: r.key,
      isEnabled: r.isEnabled,
      description: r.description,
    }));
  }

  /** Sets a flag and invalidates the cache so it applies immediately. */
  async set(key: string, isEnabled: boolean, updatedById?: string | null): Promise<{ key: string; isEnabled: boolean }> {
    await this.prisma.featureFlag.upsert({
      where: { key },
      create: { key, isEnabled, updatedById: updatedById ?? null },
      update: { isEnabled, updatedById: updatedById ?? null },
    });
    await this.redis.del(`${CACHE_PREFIX}${key}`);
    return { key, isEnabled };
  }
}
