/**
 * SMS delivery port.
 *
 * The app depends on this interface, never on Kavenegar directly (spec §40),
 * so swapping or mocking the provider touches one factory and nothing else.
 */
export interface SmsProvider {
  readonly name: string;
  /** Sends an OTP. Must not throw on a provider-side failure it can classify. */
  sendOtp(phone: string, code: string): Promise<SmsResult>;
  /** Free-form message (order updates, etc.). */
  sendText(phone: string, message: string): Promise<SmsResult>;
}

export interface SmsResult {
  delivered: boolean;
  /** Provider reference for support queries; absent when delivery failed. */
  messageId?: string;
  /** Machine-readable failure reason, safe to log (never contains the code). */
  error?: string;
}

export const SMS_PROVIDER = Symbol('SMS_PROVIDER');
