import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCodes } from '../../common/errors/error-codes';

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  /** Access-token lifetime in seconds — the frontend schedules refresh off this. */
  expiresIn: number;
}

export interface SessionView {
  id: string;
  deviceKind: string | null;
  deviceName: string | null;
  ip: string | null;
  lastUsedAt: Date;
  createdAt: Date;
  expiresAt: Date;
  current: boolean;
}

const REFRESH_TOKEN_BYTES = 48;

/**
 * Rotating opaque refresh-token sessions (ADR-0002).
 *
 * Design points that matter for the frontend:
 *   - the ACCESS token is a short-lived JWT; identity comes only from it
 *   - the REFRESH token is opaque, single-use, and rotated on every refresh
 *   - presenting an already-rotated token means the token leaked, so the
 *     ENTIRE rotation family is revoked (reuse detection)
 *
 * Only SHA-256 hashes are stored; the raw token exists solely in the cookie
 * or the mobile client.
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger('Sessions');

  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Creates a new session and its first token pair. */
  async issue(input: {
    userId: string;
    roles: string[];
    ip?: string | null;
    userAgent?: string | null;
    deviceKind?: string;
    deviceName?: string;
    familyId?: string;
  }): Promise<SessionTokens> {
    const refreshToken = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
    const expiresIn = this.config.accessTokenTtlSeconds;

    const session = await this.prisma.authSession.create({
      data: {
        userId: input.userId,
        familyId: input.familyId ?? randomUUID(),
        refreshHash: this.hashToken(refreshToken),
        deviceKind: input.deviceKind ?? 'UNKNOWN',
        deviceName: input.deviceName ?? null,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
        expiresAt: new Date(Date.now() + this.config.refreshTokenTtlDays * 86_400_000),
      },
    });

    const accessToken = await this.signAccess({
      userId: input.userId,
      sessionId: session.id,
      roles: input.roles,
    });

    return { accessToken, refreshToken, expiresIn };
  }

  /**
   * Exchanges a refresh token for a new pair and rotates it.
   * Reuse of a rotated token revokes the whole family.
   */
  async refresh(token: string, ip?: string | null, userAgent?: string | null): Promise<SessionTokens> {
    const hash = this.hashToken(token);
    const session = await this.prisma.authSession.findUnique({
      where: { refreshHash: hash },
      include: { user: { include: { roles: { include: { role: true } } } } },
    });

    if (!session) {
      throw AppError.unauthorized('Refresh token is not recognized', ErrorCodes.SESSION_EXPIRED);
    }

    // --- reuse detection: a rotated or admin-revoked token is a leak signal --
    if (session.revokedAt) {
      if (session.revokedReason === 'ROTATED') {
        this.logger.warn(`refresh-token reuse detected for session ${session.id} — revoking family ${session.familyId}`);
        await this.revokeFamily(session.familyId, 'REUSE_DETECTED');
      }
      throw AppError.unauthorized('Session has been revoked. Please sign in again.', ErrorCodes.SESSION_REVOKED);
    }

    if (session.expiresAt <= new Date()) {
      await this.prisma.authSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date(), revokedReason: 'EXPIRED' },
      });
      throw AppError.unauthorized('Session has expired. Please sign in again.', ErrorCodes.SESSION_EXPIRED);
    }

    if (session.user.status !== 'ACTIVE') {
      await this.revokeFamily(session.familyId, 'ADMIN');
      throw AppError.unauthorized('Account is not active', ErrorCodes.UNAUTHORIZED);
    }

    const roles = session.user.roles.map((r: { role: { slug: string } }) => r.role.slug);

    // Rotate: retire the presented token and mint a successor in the same family.
    const newRefresh = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
    const expiresIn = this.config.accessTokenTtlSeconds;

    await this.prisma.$transaction(async (tx) => {
      await tx.authSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date(), revokedReason: 'ROTATED', lastUsedAt: new Date() },
      });
      await tx.authSession.create({
        data: {
          userId: session.userId,
          familyId: session.familyId,
          refreshHash: this.hashToken(newRefresh),
          deviceKind: session.deviceKind,
          deviceName: session.deviceName,
          ip: ip ?? session.ip,
          userAgent: userAgent ?? session.userAgent,
          expiresAt: new Date(Date.now() + this.config.refreshTokenTtlDays * 86_400_000),
        },
      });
    });

    const accessToken = await this.signAccess({
      userId: session.userId,
      sessionId: session.id,
      roles,
    });

    return { accessToken, refreshToken: newRefresh, expiresIn };
  }

  /** Signs out. Either the cookie token or the session id may identify it. */
  async logout(refreshToken: string | undefined, sessionId: string): Promise<void> {
    if (refreshToken) {
      await this.prisma.authSession.updateMany({
        where: { refreshHash: this.hashToken(refreshToken), revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'LOGOUT' },
      });
    }
    // Also retire the session the access token belongs to, so a stolen access
    // token cannot outlive logout for more than its short TTL.
    await this.prisma.authSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'LOGOUT' },
    });
  }

  /** Active sessions for the "manage devices" screen. */
  async listSessions(userId: string, currentSessionId?: string): Promise<SessionView[]> {
    const rows = await this.prisma.authSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
      take: 50,
    });
    return rows.map((s: {
      id: string;
      deviceKind: string | null;
      deviceName: string | null;
      ip: string | null;
      lastUsedAt: Date;
      createdAt: Date;
      expiresAt: Date;
    }) => ({
      id: s.id,
      deviceKind: s.deviceKind,
      deviceName: s.deviceName,
      ip: s.ip,
      lastUsedAt: s.lastUsedAt,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      current: s.id === currentSessionId,
    }));
  }

  async revokeSession(userId: string | undefined, sessionId: string): Promise<void> {
    // Scoped by userId when supplied so one user cannot revoke another's session.
    await this.prisma.authSession.updateMany({
      where: { id: sessionId, ...(userId ? { userId } : {}), revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: userId ? 'ADMIN' : 'LOGOUT' },
    });
  }

  async revokeAllForUser(userId: string, reason: string): Promise<number> {
    const result = await this.prisma.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    return result.count;
  }

  private async revokeFamily(familyId: string, reason: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  private async signAccess(claims: { userId: string; sessionId: string; roles: string[] }): Promise<string> {
    return this.jwt.sign(
      { sub: claims.userId, sid: claims.sessionId, roles: claims.roles },
      { secret: this.config.jwtAccessSecret, expiresIn: this.config.accessTokenTtlSeconds },
    );
  }
}
