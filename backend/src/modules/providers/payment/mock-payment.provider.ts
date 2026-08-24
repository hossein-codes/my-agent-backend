import { randomUUID } from 'node:crypto';
import type { AppConfigService } from '../../../config/app-config.service';
import type { InitiateResult, PaymentInitiation, PaymentProvider, VerifyResult } from './payment-provider.port';

/**
 * Deterministic in-process gateway for development and e2e tests.
 *
 * Behaviour is driven by the `authority` so tests can choose an outcome:
 *   - authority containing `fail`    → FAILED
 *   - authority containing `cancel`  → CANCELLED
 *   - anything else                  → OK
 *
 * The amount echoed back always matches what was requested, so the
 * amount-mismatch guard is exercised by real providers, not faked away here.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';

  constructor(private readonly config: AppConfigService) {}

  async initiate(input: PaymentInitiation): Promise<InitiateResult> {
    const authority = `mock-${randomUUID()}`;
    const gatewayUrl =
      `${this.config.frontendBaseUrl}/dev-payment-gateway` +
      `?authority=${authority}&amount=${input.amount}&order=${encodeURIComponent(input.orderNumber)}` +
      `&callback=${encodeURIComponent(input.callbackUrl)}`;
    return { ok: true, authority, gatewayUrl };
  }

  async verify(authority: string, amount: number): Promise<VerifyResult> {
    const a = authority.toLowerCase();
    if (a.includes('fail')) return { outcome: 'FAILED', error: 'mock_declined' };
    if (a.includes('cancel')) return { outcome: 'CANCELLED', error: 'mock_cancelled_by_user' };
    return {
      outcome: 'OK',
      refId: `mock-ref-${randomUUID()}`,
      amount,
      cardMask: '6104-****-****-1234',
    };
  }
}
