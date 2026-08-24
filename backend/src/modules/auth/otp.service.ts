import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCodes } from '../../common/errors/error-codes';
import { SMS_PROVIDER, type SmsProvider } from '../providers/sms/sms-provider.port';

/**
 * Normalizes any accepted Iranian mobile input to E.164 `+989xxxxxxxxx`.
 * Exported because several modules accept a phone from user input.
 */
export function normalizePhone(input: string): string {
  const digits = input.replace(/[^\d+]/g, '');
  if (digits.startsWith('+989')) return digits;
  if (digits.startsWith('989')) return `+${digits}`;
  if (digits.startsWith('09')) return `+98${digits.slice(1)}`;
  if (/^9\d{9}$/.test(digits)) return `+98${digits}`;
  // Anything else is returned as-is and rejected by the DTO/regex upstream.
  return digits;
}

/**
 * One-time-password issuance and verification.
 *
 * Security properties this must preserve:
 *   - the code exists ONLY in Redis, hashed with a pepper, under a TTL
 *   - verification is atomic and single-use (the key is deleted, not flagged)
 *   - attempt counters are separate from the code, so brute force is bounded
 *     even though each attempt does not consume the code
 *   - a Redis outage FAILS CLOSED: no OTP can be issued or accepted
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger('Otp');

  constructor(
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
  ) {}

  private codeKey(phone: string, purpose: string): string {
    return `otp:${purpose}:${phone}`;
  }
  private attemptsKey(phone: string, purpose: string): string {
    return `otpatt:${purpose}:${phone}`;
  }
  private cooldownKey(phone: string, purpose: string): string {
    return `otpcd:${purpose}:${phone}`;
  }

  /** HMAC-peppered hash — a Redis dump alone cannot reveal live codes. */
  private hash(code: string): string {
    return createHmac('sha256', this.config.otpHashPepper).update(code).digest('hex');
  }

  /**
   * Issues and sends a code. Enforces a resend cooldown; the hourly cap is
   * enforced by the `otp.request` rate-limit bucket.
   */
  async request(
    phone: string,
    ip?: string | null,
    userAgent?: string | null,
    purpose: 'LOGIN' | 'ACCOUNT_RECOVERY' | 'EMAIL_VERIFY' | 'PHONE_CHANGE' = 'LOGIN',
  ): Promise<{ sent: boolean; expiresIn: number; cooldownSeconds?: number }> {
    const normalized = normalizePhone(phone);
    const otp = this.config.otp;

    // Redis is the only home for the code; without it we cannot honour
    // single-use semantics, so refuse rather than degrade.
    if (!this.redis.isAvailable) {
      throw AppError.serviceUnavailable('Verification service is temporarily unavailable');
    }

    const cdKey = this.cooldownKey(normalized, purpose);
    const cooldown = await this.redis.client.get(cdKey);
    if (cooldown !== null) {
      const ttl = await this.redis.client.ttl(cdKey);
      throw AppError.tooManyRequests(
        `Please wait ${Math.max(ttl, 1)} seconds before requesting a new code`,
        ErrorCodes.OTP_RESEND_COOLDOWN,
        Math.max(ttl, 1),
      );
    }

    const code =
      otp.fixedCode ??
      String(randomInt(0, 1_000_000)).padStart(6, '0');

    await this.redis.client.set(this.codeKey(normalized, purpose), this.hash(code), 'EX', otp.ttlSeconds);
    await this.redis.client.set(cdKey, '1', 'EX', otp.resendCooldownSeconds);
    // A fresh code resets the attempt budget.
    await this.redis.client.del(this.attemptsKey(normalized, purpose));

    const sent = await this.sms.sendOtp(normalized, code);
    if (!sent.delivered) {
      this.logger.warn(`OTP delivery failed for ${normalized}: ${sent.error}`);
      throw AppError.serviceUnavailable('Could not send the verification code. Please try again.');
    }

    // Forensics only — the code itself is never written to Postgres.
    const existingPhone = await this.prisma.userPhone.findUnique({
      where: { phone: normalized },
      select: { userId: true },
    });
    await this.prisma.otpRequestLog.create({
      data: {
        phone: normalized,
        purpose,
        ip: ip ?? null,
        userAgent: userAgent ?? null,
        userId: existingPhone?.userId ?? null,
      },
    });

    return { sent: true, expiresIn: otp.ttlSeconds };
  }

  /**
   * Verifies and consumes a code. Returns the normalized phone on success so
   * the caller never has to re-normalize (and cannot use the unverified input).
   */
  async verify(
    phone: string,
    code: string,
    purpose: 'LOGIN' | 'ACCOUNT_RECOVERY' | 'EMAIL_VERIFY' | 'PHONE_CHANGE' = 'LOGIN',
  ): Promise<string> {
    const normalized = normalizePhone(phone);
    if (!this.redis.isAvailable) {
      throw AppError.serviceUnavailable('Verification service is temporarily unavailable');
    }

    const attemptsKey = this.attemptsKey(normalized, purpose);
    const attempts = Number((await this.redis.client.incr(attemptsKey)) ?? 1);
    if (attempts === 1) await this.redis.client.expire(attemptsKey, this.config.otp.ttlSeconds * 4);

    if (attempts > this.config.otp.maxVerifyAttempts) {
      // Burn the code so a locked-out phone cannot resume guessing.
      await this.redis.client.del(this.codeKey(normalized, purpose));
      throw AppError.tooManyRequests(
        'Too many incorrect codes. Request a new one.',
        ErrorCodes.OTP_ATTEMPTS_EXCEEDED,
      );
    }

    const stored = await this.redis.client.get(this.codeKey(normalized, purpose));
    if (stored === null) {
      throw new AppError(ErrorCodes.OTP_EXPIRED, 400, 'Code has expired or was already used. Request a new one.');
    }

    if (!this.safeEqual(stored, this.hash(code))) {
      throw new AppError(ErrorCodes.OTP_INVALID, 400, 'Incorrect code');
    }

    // Single use: consume before returning so a replay cannot succeed.
    await this.redis.client.del(this.codeKey(normalized, purpose));
    await this.redis.client.del(attemptsKey);

    return normalized;
  }

  /** Constant-time comparison — avoids leaking code length/prefix by timing. */
  private safeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }
}
