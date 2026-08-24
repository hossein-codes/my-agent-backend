import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';
import { PERMISSIONS_KEY, type AuthenticatedUser } from '../decorators/auth.decorators';

/**
 * Authorization. A bug here is either a lockout (admins cannot work) or a
 * privilege escalation, so both directions are covered.
 */
function ctxFor(user: AuthenticatedUser | undefined) {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as never;
}

function guard(required: string[] | undefined, granted: string[], opts: { cached?: string | null } = {}) {
  const reflector = { getAllAndOverride: jest.fn(() => required) } as unknown as Reflector;
  const prisma = {
    permission: { findMany: jest.fn(async () => granted.map((slug) => ({ slug }))) },
  } as unknown as PrismaService;
  const redis = {
    client: { get: jest.fn(async () => opts.cached ?? null), set: jest.fn(async () => 'OK') },
    del: jest.fn(async () => undefined),
  } as unknown as RedisService;
  return { g: new PermissionsGuard(reflector, prisma, redis), prisma, redis };
}

const user = (roles: string[]): AuthenticatedUser => ({ userId: 'u1', sessionId: 's1', roles });

describe('PermissionsGuard', () => {
  it('lets any authenticated user through when the route declares no permission', async () => {
    const { g, prisma } = guard(undefined, []);
    await expect(g.canActivate(ctxFor(user(['CUSTOMER'])))).resolves.toBe(true);
    expect(prisma.permission.findMany).not.toHaveBeenCalled();
  });

  it('allows a user who holds one of several accepted permissions (OR semantics)', async () => {
    const { g } = guard(['order.read', 'order.manage'], ['order.read']);
    await expect(g.canActivate(ctxFor(user(['SUPPORT'])))).resolves.toBe(true);
  });

  it('denies a user who holds none of them', async () => {
    const { g } = guard(['user.manage'], ['products.read']);
    await expect(g.canActivate(ctxFor(user(['PRODUCT_MANAGER'])))).rejects.toMatchObject({ statusCode: 403 });
  });

  it('lets SUPER_ADMIN bypass the permission check entirely', async () => {
    // Break-glass: an admin must never lock themselves out of the admin panel.
    const { g, prisma } = guard(['user.manage'], []);
    await expect(g.canActivate(ctxFor(user(['SUPER_ADMIN'])))).resolves.toBe(true);
    expect(prisma.permission.findMany).not.toHaveBeenCalled();
  });

  it('answers 401 (not 403) when there is no principal at all', async () => {
    const { g } = guard(['user.manage'], ['user.manage']);
    await expect(g.canActivate(ctxFor(undefined))).rejects.toMatchObject({ statusCode: 401 });
  });

  it('resolves permissions from the database, not from the role slugs in the token', async () => {
    // This is the bug the guard was rewritten to fix: role slugs such as
    // SUPPORT must not be compared against permission slugs such as user.manage.
    const { g, prisma } = guard(['user.manage'], []);
    await expect(g.canActivate(ctxFor(user(['SUPPORT'])))).rejects.toMatchObject({ statusCode: 403 });
    expect(prisma.permission.findMany).toHaveBeenCalledTimes(1);
  });

  it('serves a warm cache without hitting the database', async () => {
    const { g, prisma } = guard(['user.manage'], [], { cached: JSON.stringify(['user.manage']) });
    await expect(g.canActivate(ctxFor(user(['SUPPORT'])))).resolves.toBe(true);
    expect(prisma.permission.findMany).not.toHaveBeenCalled();
  });

  it('writes the resolved set back to the cache', async () => {
    const { g, redis } = guard(['user.manage'], ['user.manage']);
    await g.canActivate(ctxFor(user(['SUPPORT'])));
    expect(redis.client.set).toHaveBeenCalledWith('perms:u1', '["user.manage"]', 'EX', 60);
  });

  it('still authorizes correctly when Redis is down', async () => {
    const reflector = { getAllAndOverride: jest.fn(() => ['user.manage']) } as unknown as Reflector;
    const prisma = {
      permission: { findMany: jest.fn(async () => [{ slug: 'user.manage' }]) },
    } as unknown as PrismaService;
    const redis = {
      client: {
        get: jest.fn(async () => {
          throw new Error('ECONNREFUSED');
        }),
        set: jest.fn(async () => {
          throw new Error('ECONNREFUSED');
        }),
      },
      del: jest.fn(),
    } as unknown as RedisService;

    const g = new PermissionsGuard(reflector, prisma, redis);
    await expect(g.canActivate(ctxFor(user(['SUPPORT'])))).resolves.toBe(true);
  });

  it('invalidate() drops the cached set so a revocation applies immediately', async () => {
    const { g, redis } = guard(['user.manage'], []);
    await g.invalidate('u1');
    expect(redis.del).toHaveBeenCalledWith('perms:u1');
  });

  it('exports the metadata key the decorator writes', () => {
    expect(PERMISSIONS_KEY).toBe('app:permissions');
  });
});
