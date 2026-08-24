import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppError } from '../errors/app-error';
import { ErrorCodes } from '../errors/error-codes';
import { PERMISSIONS_KEY, type AuthenticatedUser } from '../decorators/auth.decorators';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';

/**
 * Authorization guard — runs after `JwtAuthGuard`, so `request.user` is set.
 *
 * Roles and permissions are different things:
 *   - the access token carries ROLE slugs only (CUSTOMER, SUPER_ADMIN, …)
 *   - PERMISSION slugs (`user.manage`, `order.read`, …) are resolved from the
 *     Role → RolePermission → Permission graph at request time
 *
 * Permissions are cached in Redis for `PERMISSION_CACHE_SECONDS`. Revoking a
 * role or editing a role's permissions invalidates the cache immediately
 * (`invalidate(userId)`); otherwise a change takes effect within the TTL.
 *
 * Rules:
 *   - no `@Permissions()`  → any authenticated user passes
 *   - `@Permissions('a','b')` → the user needs ANY one of them (OR)
 *   - `SUPER_ADMIN` role   → always passes (break-glass)
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger('Permissions');
  private static readonly CACHE_SECONDS = 60;

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    // JwtAuthGuard runs first for every non-public route; reaching this without
    // a principal is a wiring bug, not a permission denial.
    if (!user) throw AppError.unauthorized('Authentication required', ErrorCodes.UNAUTHORIZED);

    if (user.roles.includes('SUPER_ADMIN')) return true;

    const granted = await this.permissionsFor(user.userId);
    const hasAny = required.some((p) => granted.has(p));
    if (!hasAny) {
      throw AppError.forbidden(`Missing required permission: ${required.join(' or ')}`, ErrorCodes.FORBIDDEN);
    }
    return true;
  }

  /** Drops the cached permission set so a change applies on the next request. */
  async invalidate(userId: string): Promise<void> {
    await this.redis.del(this.cacheKey(userId));
  }

  private cacheKey(userId: string): string {
    return `perms:${userId}`;
  }

  private async permissionsFor(userId: string): Promise<Set<string>> {
    const key = this.cacheKey(userId);
    try {
      const cached = await this.redis.client.get(key);
      if (cached !== null) return new Set<string>(JSON.parse(cached) as string[]);
    } catch {
      /* cache miss / Redis down → fall through to the DB */
    }

    const rows = await this.prisma.permission.findMany({
      where: { roles: { some: { role: { users: { some: { userId } } } } } },
      select: { slug: true },
    });
    // Annotated so this compiles before `prisma generate` has run.
    const slugs = rows.map((r: { slug: string }) => r.slug);

    try {
      await this.redis.client.set(key, JSON.stringify(slugs), 'EX', PermissionsGuard.CACHE_SECONDS);
    } catch (err) {
      // A cold cache is slow, not broken — keep serving.
      this.logger.debug(`permission cache write failed: ${(err as Error).message}`);
    }
    return new Set(slugs);
  }
}
