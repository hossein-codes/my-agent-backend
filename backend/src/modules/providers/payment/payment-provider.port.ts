/**
 * Payment gateway port (spec §40).
 *
 * The core never imports Zarinpal. Swapping gateways means implementing this
 * interface and changing one factory — orders, refunds and reconciliation are
 * untouched.
 *
 * Amounts are Integer Toman throughout.
 */
export interface PaymentInitiation {
  /** Amount the gateway must collect. Server-derived — never client-supplied. */
  amount: number;
  /** Order number shown on the gateway page. */
  orderNumber: string;
  description?: string;
  /** Absolute URL the gateway redirects the browser back to. */
  callbackUrl: string;
  payerPhone?: string;
}

export interface InitiateResult {
  ok: boolean;
  /** Gateway handle; used to correlate the redirect and the verification. */
  authority?: string;
  /** Where to send the browser. Absent for gateways with no redirect. */
  gatewayUrl?: string;
  error?: string;
}

export type VerifyOutcome = 'OK' | 'FAILED' | 'CANCELLED' | 'UNKNOWN';

export interface VerifyResult {
  outcome: VerifyOutcome;
  /** Gateway transaction reference, present only on OK. */
  refId?: string;
  /** Amount the gateway confirms it collected — must be compared to ours. */
  amount?: number;
  /** Masked PAN, e.g. `6104-****-****-1234`. Never a full card number. */
  cardMask?: string;
  error?: string;
}

export interface PaymentProvider {
  readonly name: string;
  initiate(input: PaymentInitiation): Promise<InitiateResult>;
  /**
   * Server-to-gateway confirmation. This — and ONLY this — may cause an order
   * to become paid; a browser redirect proves nothing (spec §15).
   */
  verify(authority: string, amount: number): Promise<VerifyResult>;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
