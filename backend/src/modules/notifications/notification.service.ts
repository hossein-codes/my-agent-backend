import { Injectable, Logger } from '@nestjs/common';
import type { NotificationChannel, NotificationType } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import { NotificationDispatcher } from './dispatcher.service';

export interface NotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  /** Safe display metadata only — never identity or payment secrets (spec §24). */
  data?: Record<string, unknown>;
  /**
   * Idempotency guard. A duplicate key is silently ignored, so a retried
   * webhook or a replayed job cannot double-notify the customer.
   */
  dedupeKey?: string;
  channels?: NotificationChannel[];
}

/**
 * In-app notification inbox + fan-out to SMS/email.
 *
 * `Notification` is the durable record; `NotificationDelivery` tracks each
 * channel attempt. A unique (notificationId, channel) constraint makes the
 * delivery rows themselves idempotent.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger('Notifications');

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher: NotificationDispatcher,
  ) {}

  /**
   * Creates the notification and dispatches it.
   * Dispatch failures never fail the caller's business operation.
   */
  async notify(input: NotificationInput): Promise<{ id: string; created: boolean }> {
    if (input.dedupeKey) {
      const existing = await this.prisma.notification.findUnique({
        where: { dedupeKey: input.dedupeKey },
        select: { id: true },
      });
      if (existing) return { id: existing.id, created: false };
    }

    const notification = await this.prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        data: (input.data ?? undefined) as never,
        dedupeKey: input.dedupeKey ?? null,
      },
    });

    try {
      await this.dispatcher.dispatch(notification.id, input.userId, input.channels);
    } catch (err) {
      this.logger.error(`dispatch failed for ${notification.id}: ${(err as Error).message}`);
    }

    return { id: notification.id, created: true };
  }

  async listForUser(
    userId: string,
    page: number,
    pageSize: number,
    unreadOnly = false,
  ): Promise<{ items: unknown[]; total: number }> {
    const where = { userId, ...(unreadOnly ? { readAt: null } : {}) };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.notification.count({ where }),
    ]);
    const items = rows.map((n: {
      id: string;
      type: string;
      title: string;
      body: string;
      data: unknown;
      readAt: Date | null;
      createdAt: Date;
    }) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      data: n.data ?? null,
      isRead: n.readAt !== null,
      createdAt: n.createdAt,
    }));
    return { items, total };
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  /** Ownership is enforced in the query, never by a find-then-check. */
  async markRead(userId: string, notificationId: string): Promise<void> {
    const result = await this.prisma.notification.updateMany({
      where: { id: notificationId, userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (result.count === 0) {
      const exists = await this.prisma.notification.findFirst({ where: { id: notificationId, userId }, select: { id: true } });
      if (!exists) throw AppError.notFound('Notification not found');
    }
  }

  async markAllRead(userId: string): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return result.count;
  }

  async getPreferences(userId: string) {
    const prefs = await this.prisma.notificationPreference.findUnique({ where: { userId } });
    return (
      prefs ??
      (await this.prisma.notificationPreference.create({ data: { userId } }))
    );
  }

  async updatePreferences(
    userId: string,
    patch: { smsEnabled?: boolean; emailEnabled?: boolean; inAppEnabled?: boolean; promotionalEnabled?: boolean },
  ) {
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, ...patch },
      update: patch,
    });
  }
}
