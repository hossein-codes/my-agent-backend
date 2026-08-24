import { Logger } from '@nestjs/common';
import type { AppConfigService } from '../../../config/app-config.service';
import type { HttpService } from '../http.service';
import type { InitiateResult, PaymentInitiation, PaymentProvider, VerifyResult } from './payment-provider.port';

interface ZarinpalResponse {
  data?: { code: number; message: string; authority?: string; ref_id?: number | string; wage_status?: unknown };
  errors?: { code: number; message: string };
}

/**
 * Zarinpal PaymentRequest / PaymentVerification.
 *
 * Notes that matter for correctness:
 *   - the sandbox host is selected from config, never hardcoded
 *   - `verify` is a real server-to-gateway call; the browser redirect is never
 *     trusted (spec §15)
 *   - an unverifiable gateway response maps to `UNKNOWN`, never to `OK` —
 *     money is only recorded on explicit confirmation
 */
export class ZarinpalProvider implements PaymentProvider {
  readonly name = 'zarinpal';
  private readonly logger = new Logger('Zarinpal');

  constructor(
    private readonly config: AppConfigService,
    private readonly http: HttpService,
  ) {}

  private get host(): string {
    return this.config.zarinpal.sandbox ? 'https://sandbox.zarinpal.com' : 'https://api.zarinpal.com';
  }
  private get merchantId(): string {
    return this.config.zarinpal.merchantId;
  }

  async initiate(input: PaymentInitiation): Promise<InitiateResult> {
    if (!this.merchantId) return { ok: false, error: 'zarinpal_merchant_id_missing' };

    const res = await this.http.request<ZarinpalResponse>(`${this.host}/pg/v4/payment/request.json`, {
      method: 'POST',
      timeoutMs: 15000,
      body: {
        merchant_id: this.merchantId,
        amount: input.amount,
        callback_url: input.callbackUrl,
        description: input.description ?? `سفارش ${input.orderNumber}`,
        metadata: { order: input.orderNumber, mobile: input.payerPhone ?? '' },
      },
    });

    const data = res.data;
    // Zarinpal signals success with data.code === 100.
    if (!res.ok || data?.data?.code !== 100 || !data.data.authority) {
      const message = data?.errors?.message ?? data?.data?.message ?? `http_${res.status}`;
      this.logger.warn(`initiate rejected: ${message}`);
      return { ok: false, error: message };
    }

    return {
      ok: true,
      authority: data.data.authority,
      gatewayUrl: `${this.host}/pg/StartPay/${data.data.authority}`,
    };
  }

  async verify(authority: string, amount: number): Promise<VerifyResult> {
    if (!this.merchantId) return { outcome: 'UNKNOWN', error: 'zarinpal_merchant_id_missing' };

    try {
      const res = await this.http.request<ZarinpalResponse>(`${this.host}/pg/v4/payment/verify.json`, {
        method: 'POST',
        timeoutMs: 15000,
        body: { merchant_id: this.merchantId, amount, authority },
      });

      const code = res.data?.data?.code;
      // 100 = paid, 101 = already verified before (idempotent replay).
      if (code === 100 || code === 101) {
        return {
          outcome: 'OK',
          refId: String(res.data?.data?.ref_id ?? ''),
          amount,
        };
      }
      if (code === -21) return { outcome: 'CANCELLED', error: 'cancelled_by_user' };

      return { outcome: 'FAILED', error: res.data?.errors?.message ?? `verify_code_${code ?? 'unknown'}` };
    } catch (err) {
      // Network failure must NOT be read as a failed payment: the money may
      // have moved. UNKNOWN leaves the order open for the reconciliation job.
      this.logger.error(`verify call failed: ${(err as Error).message}`);
      return { outcome: 'UNKNOWN', error: (err as Error).message };
    }
  }
}
