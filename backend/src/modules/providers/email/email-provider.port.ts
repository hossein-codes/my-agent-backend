export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain text body — HTML templates arrive with the SMTP provider. */
  text: string;
}

export interface EmailResult {
  delivered: boolean;
  error?: string;
}

/**
 * Transactional email port. Only account-recovery mail uses it today; SMTP
 * wiring arrives when a real sending provider is chosen.
 */
export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<EmailResult>;
}

export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');
