import { Injectable, Logger } from '@nestjs/common';
import type { EmailMessage, EmailProvider, EmailResult } from './email-provider.port';

/**
 * Drops the message and reports `delivered: false`.
 *
 * This exists because SMTP is not implemented yet, and the production guard
 * (correctly) refuses `console`, which would leak account-recovery text into
 * platform logs. Without an explicit "no email" provider there would be NO
 * valid production value at all — the API could not boot.
 *
 * Callers already treat `delivered: false` as a soft failure: account recovery
 * simply tells the user the channel is unavailable instead of pretending.
 */
@Injectable()
export class NoopEmailProvider implements EmailProvider {
  readonly name = 'noop';
  private readonly logger = new Logger('Email:noop');
  private warned = false;

  async send(message: EmailMessage): Promise<EmailResult> {
    if (!this.warned) {
      this.warned = true;
      this.logger.warn(
        'EMAIL_PROVIDER=noop — transactional email is NOT delivered. ' +
          'Set EMAIL_PROVIDER=smtp once a real sending provider is wired up.',
      );
    }
    this.logger.debug(`dropped email to ${message.to} (subject: ${message.subject})`);
    return { delivered: false, error: 'email provider not configured' };
  }
}
