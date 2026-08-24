import { Injectable, Logger } from '@nestjs/common';
import type { EmailMessage, EmailProvider, EmailResult } from './email-provider.port';

/** Logs the message instead of sending it. Development only. */
@Injectable()
export class ConsoleEmailProvider implements EmailProvider {
  readonly name = 'console';
  private readonly logger = new Logger('Email:console');

  async send(message: EmailMessage): Promise<EmailResult> {
    this.logger.warn(`[DEV ONLY] email to ${message.to}\n  subject: ${message.subject}\n  ${message.text}`);
    return { delivered: true };
  }
}
