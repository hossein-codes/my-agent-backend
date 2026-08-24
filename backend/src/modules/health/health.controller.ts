import { Controller, Get } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/auth.decorators';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';

interface CheckResult {
  status: 'ok' | 'degraded' | 'down';
  latencyMs?: number;
  error?: string;
}

/**
 * Probe endpoints for Docker/Kubernetes.
 *
 * Both are `@Public()` and excluded from the global prefix in `app.setup.ts`,
 * so they stay at `/health/*` regardless of API version — the Dockerfile
 * HEALTHCHECK depends on that URL being stable.
 *
 * The distinction matters operationally:
 *   - `live`  → "is the process up?" — must NOT depend on any datastore,
 *               otherwise a database blip causes a restart storm
 *   - `ready` → "can it serve traffic?" — checks Postgres (required) and
 *               Redis (optional, so its failure is `degraded`, not `down`)
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get('live')
  @Public()
  @ApiExcludeEndpoint()
  live(): { status: 'ok'; uptimeSeconds: number } {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }

  @Get('ready')
  @Public()
  @ApiExcludeEndpoint()
  async ready(): Promise<{
    status: 'ready' | 'degraded' | 'not_ready';
    checks: { database: CheckResult; redis: CheckResult };
  }> {
    const database = await this.checkDatabase();
    const redis = this.checkRedis();

    // Postgres is load-bearing: without it nothing can be served.
    if (database.status === 'down') return { status: 'not_ready', checks: { database, redis } };
    // Redis is a cache: a Redis outage degrades features but does not stop traffic.
    if (redis.status === 'down') return { status: 'degraded', checks: { database, redis } };
    return { status: 'ready', checks: { database, redis } };
  }

  private async checkDatabase(): Promise<CheckResult> {
    const started = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', latencyMs: Date.now() - started };
    } catch (err) {
      return { status: 'down', latencyMs: Date.now() - started, error: (err as Error).message };
    }
  }

  private checkRedis(): CheckResult {
    return this.redis.isAvailable ? { status: 'ok' } : { status: 'down', error: 'not connected' };
  }
}
