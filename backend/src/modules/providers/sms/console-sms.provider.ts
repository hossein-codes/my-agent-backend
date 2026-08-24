import { Injectable, Logger } from '@nestjs/common';
import type { SmsProvider, SmsResult } from './sms-provider.port';

/**
 * Development SMS provider — logs the code instead of sending it.
 *
 * Never usable in production: `AppConfigService` keeps `OTP_FIXED_CODE`
 * undefined there, and `ProvidersModule` refuses to select this provider when
 * `NODE_ENV=production`.
 */
@Injectable()
export class ConsoleSmsProvider implements SmsProvider {
  readonly name = 'console';
  private readonly logger = new Logger('SMS:console');

  async sendOtp(phone: string, code: string): Promise<SmsResult> {
    this.logger.warn(`[DEV ONLY] OTP for ${phone} is ${code}`);
    return { delivered: true, messageId: `dev-${Date.now()}` };
  }

  async sendText(phone: string, message: string): Promise<SmsResult> {
    this.logger.warn(`[DEV ONLY] SMS to ${phone}: ${message}`);
    return { delivered: true, messageId: `dev-${Date.now()}` };
  }
}
