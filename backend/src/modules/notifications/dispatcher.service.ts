import { Inject, Injectable, Logger } from '@nestjs/common';
import type { NotificationChannel } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { SMS_PROVIDER, type SmsProvider } from '../providers/sms/sms-provider.port';
import { EMAIL_PROVIDER, type EmailProvider } from '../providers/email/email-provider.port';

/**
 * Fan-out from a stored Notification to its delivery channels.
 *
 * Every channel attempt is recorded as a `NotificationDelivery` row, so the
 * ops view can show "SMS failed, in-app delivered" rather than a single
 * ambiguous status. The unique (notificationId, channel) index prevents a
 * retry from creating a second row for the same channel.
 *
 * User preferences are authoritative: a disabled channel is recorded as
 * SKIPPED, not silently dropped, so support can explain a missing message.
 */
@Injectable()
export class NotificationDispatcher {
  private readonly logger = new Logger('Dispatcher');

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
  ) {}

  async dispatch(notificationId: string, userId: string, channels?: NotificationChannel[]): Promise<void> {
    const [notification, prefs, contact] = await this.prisma.$transaction([
      this.prisma.notification.findUniqueOrThrow({ where: { id: notificationId } }),
      this.prisma.notificationPreference.upsert({
        where: { userId },
        create: { userId },
        update: {},
      }),
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        include: {
          phones: { where: { isPrimary: true }, take: 1 },
          emails: { where: { isPrimary: true }, take: 1 },
        },
      }),
    ]);

    const wanted = channels ?? (['IN_APP'] as NotificationChannel[]);

    for (const channel of wanted) {
      const allowed = this.isAllowed(channel, {
        smsEnabled: prefs.smsEnabled,
        emailEnabled: prefs.emailEnabled,
        inAppEnabled: prefs.inAppEnabled,
        promotionalEnabled: prefs.promotionalEnabled,
        type: notification.type,
      });

      if (!allowed) {
        await this.recordDelivery(notificationId, channel, 'SKIPPED', undefined, 'preference_disabled');
        continue;
      }

      try {
        switch (channel) {
          case 'IN_APP':
            // The row itself IS the in-app delivery.
            await this.recordDelivery(notificationId, channel, 'SENT', 'in-app');
            break;
          case 'SMS': {
            const phone = contact.phones[0]?.phone;
            if (!phone) {
              await this.recordDelivery(notificationId, channel, 'SKIPPED', undefined, 'no_phone');
              break;
            }
            const result = await this.sms.sendText(phone, `${notification.title}\n${notification.body}`);
            await this.recordDelivery(
              notificationId,
              channel,
              result.delivered ? 'SENT' : 'FAILED',
              this.sms.name,
              result.delivered ? undefined : (result.error ?? 'send_failed'),
              result.messageId,
            );
            break;
          }
          case 'EMAIL': {
            const email = contact.emails[0]?.email;
            if (!email) {
              await this.recordDelivery(notificationId, channel, 'SKIPPED', undefined, 'no_email');
              break;
            }
            const result = await this.email.send({
              to: email,
              subject: notification.title,
              text: notification.body,
            });
            await this.recordDelivery(
              notificationId,
              channel,
              result.delivered ? 'SENT' : 'FAILED',
              this.email.name,
              result.delivered ? undefined : (result.error ?? 'send_failed'),
            );
            break;
          }
          default:
            this.logger.warn(`unknown notification channel: ${String(channel)}`);
        }
      } catch (err) {
        await this.recordDelivery(notificationId, channel, 'FAILED', undefined, (err as Error).message);
      }
    }
  }

  /** Promotional traffic is opt-in and requires BOTH the promo and channel flags. */
  private isAllowed(
    channel: NotificationChannel,
    prefs: {
      smsEnabled: boolean;
      emailEnabled: boolean;
      inAppEnabled: boolean;
      promotionalEnabled: boolean;
      type: string;
    },
  ): boolean {
    if (prefs.type === 'PROMOTIONAL' && !prefs.promotionalEnabled) return false;
    switch (channel) {
      case 'SMS':
        return prefs.smsEnabled;
      case 'EMAIL':
        return prefs.emailEnabled;
      case 'IN_APP':
        return prefs.inAppEnabled;
      default:
        return false;
    }
  }

  private async recordDelivery(
    notificationId: string,
    channel: NotificationChannel,
    status: 'SENT' | 'FAILED' | 'SKIPPED',
    provider?: string,
    error?: string,
    providerMessageId?: string,
  ): Promise<void> {
    // Upsert so a retry cannot create a duplicate row for the same channel.
    await this.prisma.notificationDelivery.upsert({
      where: { notificationId_channel: { notificationId, channel } },
      create: {
        notificationId,
        channel,
        status,
        provider: provider ?? null,
        error: error ?? null,
        providerMessageId: providerMessageId ?? null,
        attempts: 1,
        sentAt: status === 'SENT' ? new Date() : null,
      },
      update: {
        status,
        provider: provider ?? null,
        error: error ?? null,
        providerMessageId: providerMessageId ?? null,
        attempts: { increment: 1 },
        sentAt: status === 'SENT' ? new Date() : null,
      },
    });
  }
}
