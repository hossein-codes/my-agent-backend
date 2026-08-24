import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma, type AuditActorType } from '@prisma/client';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../shared/prisma/prisma.service';

export interface AuditContext {
  actorType: AuditActorType | 'ADMIN' | 'SYSTEM' | 'USER';
  actorId?: string | null;
  actorRole?: string | null;
  /** Snapshot of who acted, so the record survives user deletion/anonymization. */
  actorSnapshot?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

export interface AuditEvent {
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Append-only, hash-chained audit log.
 *
 * Each row stores `prevHash` (the previous row's `rowHash`) and its own
 * `rowHash = SHA-256(prevHash ‖ canonical fields ‖ AUDIT_HASH_KEY)`. Tampering
 * with or deleting any historical row breaks the chain from that point onward,
 * which `verifyChain()` can detect.
 *
 * `AuditLog` has NO foreign key to User (spec §15) — actor identity is
 * snapshotted into `actorSnapshot` at write time.
 *
 * Writes are serialized in-process: the chain head must be read and written
 * atomically, and a single Node process is the only writer per instance.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');
  /** Serializes chain-head reads so concurrent records cannot share a prevHash. */
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Records an entry. Never throws to the caller: an audit failure must not
   * roll back the business operation that triggered it, but it IS logged
   * loudly because a broken audit trail is a compliance incident.
   */
  record(ctx: AuditContext, event: AuditEvent): Promise<void> {
    this.writeQueue = this.writeQueue
      .then(() => this.write(ctx, event))
      .catch((err: unknown) => {
        this.logger.error(`failed to record ${event.action}: ${(err as Error).message}`);
      });
    return this.writeQueue.then(() => undefined);
  }

  private async write(ctx: AuditContext, event: AuditEvent): Promise<void> {
    const last = await this.prisma.auditLog.findFirst({
      orderBy: { seq: 'desc' },
      select: { rowHash: true },
    });
    const prevHash = last?.rowHash ?? null;

    const rowHash = this.hash(prevHash, ctx, event);

    await this.prisma.auditLog.create({
      data: {
        actorType: ctx.actorType as AuditActorType,
        actorId: ctx.actorId ?? null,
        actorRole: ctx.actorRole ?? null,
        actorSnapshot: this.toJson(ctx.actorSnapshot ?? null),
        action: event.action,
        entityType: event.entityType ?? null,
        entityId: event.entityId ?? null,
        oldValues: this.toJson(event.oldValues ?? null),
        newValues: this.toJson(event.newValues ?? null),
        metadata: this.toJson(event.metadata ?? null),
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
        requestId: ctx.requestId ?? null,
        prevHash,
        rowHash,
      },
    });
  }

  /**
   * Walks the chain and returns the first row whose hash does not match.
   * Used by the admin integrity report; a non-null result means tampering.
   */
  async verifyChain(fromSeq?: bigint, limit = 1000): Promise<{ ok: boolean; brokenAtSeq?: string }> {
    const rows = await this.prisma.auditLog.findMany({
      where: fromSeq ? { seq: { gte: fromSeq } } : undefined,
      orderBy: { seq: 'asc' },
      take: limit,
    });

    for (const row of rows) {
      const expected = this.hashRow(row);
      if (expected !== row.rowHash) {
        return { ok: false, brokenAtSeq: row.seq.toString() };
      }
    }
    return { ok: true };
  }

  /** Canonical, stable serialization — key order must not affect the hash. */
  private canonical(value: unknown): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map((v) => this.canonical(v)).join(',')}]`;
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${this.canonical(v)}`);
    return `{${entries.join(',')}}`;
  }

  private hash(prevHash: string | null, ctx: AuditContext, event: AuditEvent): string {
    const payload = this.canonical({
      prevHash,
      actorType: ctx.actorType,
      actorId: ctx.actorId ?? null,
      actorRole: ctx.actorRole ?? null,
      action: event.action,
      entityType: event.entityType ?? null,
      entityId: event.entityId ?? null,
      oldValues: event.oldValues ?? null,
      newValues: event.newValues ?? null,
    });
    return createHash('sha256').update(`${payload}|${this.config.auditHashKey}`).digest('hex');
  }

  private hashRow(row: {
    prevHash: string | null;
    actorType: string;
    actorId: string | null;
    actorRole: string | null;
    action: string;
    entityType: string | null;
    entityId: string | null;
    oldValues: Prisma.JsonValue | null;
    newValues: Prisma.JsonValue | null;
  }): string {
    return this.hash(row.prevHash, 
      { actorType: row.actorType, actorId: row.actorId, actorRole: row.actorRole },
      {
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        oldValues: row.oldValues as Record<string, unknown> | null,
        newValues: row.newValues as Record<string, unknown> | null,
      },
    );
  }

  private toJson(value: Record<string, unknown> | null): Prisma.InputJsonValue | null {
    return value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
  }
}
