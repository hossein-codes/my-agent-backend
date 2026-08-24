import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../../config/app-config.service';
import { HttpService } from '../http.service';
import type { SmsProvider, SmsResult } from './sms-provider.port';

/**
 * Kavenegar OTP delivery via the `VerifyLookup` API.
 *
 * Uses a pre-registered template (`KAVENEGAR_OTP_TEMPLATE`) rather than a raw
 * send, because Iranian carriers require approved templates for OTP traffic.
 *
 * Failure policy: transport errors are returned as `{ delivered: false }`
 * rather than thrown, so the caller can rate-limit and log without a 500
 * leaking provider internals.
 */
@Injectable()
export class KavenegarProvider implements SmsProvider {
  readonly name = 'kavenegar';
  private readonly logger = new Logger('SMS:kavenegar');

  constructor(
    private readonly config: AppConfigService,
    private readonly http: HttpService,
  ) {}

  async sendOtp(phone: string, code: string): Promise<SmsResult> {
    const { apiKey, otpTemplate } = this.config.kavenegar;
    if (!apiKey) return { delivered: false, error: 'kavenegar_api_key_missing' };

    // Kavenegar expects the local number without the +98 prefix.
    const receptor = phone.replace(/^\+98/, '0');
    const url = `https://api.kavenegar.com/v1/${apiKey}/verify/lookup.json`;
    const body = new URLSearchParams({ receptor, token: code, template: otpTemplate });

    try {
      const res = await this.http.request<{ return: { status: number; message: string }; entries?: string[] }>(
        url,
        { method: 'POST', body: body.toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );
      // Kavenegar signals success with return.status === 200 inside a 200 response.
      if (res.ok && res.data?.return?.status === 200) {
        return { delivered: true, messageId: res.data.entries?.[0] };
      }
      this.logger.warn(`OTP send rejected: ${res.data?.return?.message ?? res.raw.slice(0, 200)}`);
      return { delivered: false, error: res.data?.return?.message ?? `http_${res.status}` };
    } catch (err) {
      return { delivered: false, error: (err as Error).message };
    }
  }

  async sendText(phone: string, message: string): Promise<SmsResult> {
    const { apiKey, sender } = this.config.kavenegar;
    if (!apiKey) return { delivered: false, error: 'kavenegar_api_key_missing' };

    const receptor = phone.replace(/^\+98/, '0');
    const url = `https://api.kavenegar.com/v1/${apiKey}/sms/send.json`;
    const body = new URLSearchParams({ sender, receptor, message });

    try {
      const res = await this.http.request<{ return: { status: number; message: string }; entries?: string[] }>(
        url,
        { method: 'POST', body: body.toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );
      if (res.ok && res.data?.return?.status === 200) {
        return { delivered: true, messageId: res.data.entries?.[0] };
      }
      return { delivered: false, error: res.data?.return?.message ?? `http_${res.status}` };
    } catch (err) {
      return { delivered: false, error: (err as Error).message };
    }
  }
}
