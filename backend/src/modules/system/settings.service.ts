import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';

const CACHE_PREFIX = 'set:';
const CACHE_SECONDS = 60;

export type SettingValueType = 'string' | 'integer' | 'boolean' | 'json';

/**
 * Key/value system settings (store name, default shipping method, …).
 *
 * `isPublic` gates what the storefront may read: the public endpoint returns
 * ONLY rows flagged public, so an internal setting can never leak through it.
 */
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async get(key: string): Promise<string | null> {
    const cacheKey = `${CACHE_PREFIX}${key}`;
    try {
      const cached = await this.redis.client.get(cacheKey);
      if (cached !== null) return cached === '\u0000' ? null : cached;
    } catch {
      /* read through */
    }

    const row = await this.prisma.systemSetting.findUnique({ where: { key }, select: { value: true } });
    try {
      // A sentinel encodes "known missing" so absent keys do not hit the DB every call.
      await this.redis.client.set(cacheKey, row?.value ?? '\u0000', 'EX', CACHE_SECONDS);
    } catch {
      /* non-fatal */
    }
    return row?.value ?? null;
  }

  async getTyped<T>(key: string, type: SettingValueType, fallback: T): Promise<T> {
    const raw = await this.get(key);
    if (raw === null) return fallback;
    try {
      switch (type) {
        case 'integer':
          return (Number.parseInt(raw, 10) as unknown) as T;
        case 'boolean':
          return (['1', 'true', 'yes', 'on'].includes(raw.toLowerCase()) as unknown) as T;
        case 'json':
          return JSON.parse(raw) as T;
        default:
          return (raw as unknown) as T;
      }
    } catch {
      return fallback;
    }
  }

  async set(key: string, value: string, type: SettingValueType = 'string', opts?: { isPublic?: boolean; updatedById?: string | null }): Promise<void> {
    await this.prisma.systemSetting.upsert({
      where: { key },
      create: {
        key,
        value,
        valueType: type,
        isPublic: opts?.isPublic ?? false,
        updatedById: opts?.updatedById ?? null,
      },
      update: { value, valueType: type, updatedById: opts?.updatedById ?? null },
    });
    await this.redis.del(`${CACHE_PREFIX}${key}`);
  }

  /** Only rows explicitly marked public. */
  async listPublic(): Promise<Record<string, string>> {
    const rows = await this.prisma.systemSetting.findMany({ where: { isPublic: true } });
    return Object.fromEntries(
      rows.map((r: { key: string; value: string }) => [r.key, r.value] as const),
    );
  }
}
