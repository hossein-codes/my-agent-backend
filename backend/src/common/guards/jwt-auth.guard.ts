import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { AppConfigService } from '../../config/app-config.service';
import { AppError } from '../errors/app-error';
import { ErrorCodes } from '../errors/error-codes';
import { IS_PUBLIC_KEY } from '../decorators/auth.decorators';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';

export interface AccessTokenClaims {
  sub: string;
  sid: string;
  roles: string[];
  iat: number;
  exp: number;
}

/** Global guard: verifies the JWT; identity comes ONLY from the token (spec §2). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** M-2 FIX: blocked/deleted users lose access on the NEXT request (spec
   * edge-case) — status checked via a 15s Redis cache; admin block/soft-delete
   * invalidates it immediately. */
  private async assertUserActive(userId: string): Promise<void> {
    const cacheKey = `ustatus:${userId}`;
    let status: string | null = null;
    try {
      status = await this.redis.client.get(cacheKey);
    } catch { /* cache unavailable → fall through to DB */ }
    if (status === 'ACTIVE') return;
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { status: true } });
    if (!user || user.status !== 'ACTIVE') {
      try { await this.redis.client.set(cacheKey, user?.status ?? 'DELETED', 'EX', 15); } catch { /* non-fatal */ }
      throw AppError.unauthorized('Account is not active', ErrorCodes.UNAUTHORIZED);
    }
    try { await this.redis.client.set(cacheKey, 'ACTIVE', 'EX', 15); } catch { /* non-fatal */ }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw AppError.unauthorized('Authentication required', ErrorCodes.UNAUTHORIZED);
    }
    let claims: AccessTokenClaims;
    try {
      claims = this.jwt.verify<AccessTokenClaims>(header.slice(7), {
        secret: this.config.jwtAccessSecret,
      });
    } catch {
      throw AppError.unauthorized('Invalid or expired access token', ErrorCodes.UNAUTHORIZED);
    }
    request.user = { userId: claims.sub, sessionId: claims.sid, roles: claims.roles ?? [] };
    await this.assertUserActive(claims.sub);
    return true;
  }
}
