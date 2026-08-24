import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCodes } from '../../common/errors/error-codes';
import { EMAIL_PROVIDER, type EmailProvider } from '../providers/email/email-provider.port';
import { normalizePhone } from './otp.service';

const TOKEN_BYTES = 32;
const TOKEN_TTL_MS = 15 * 60 * 1000;

/**
 * Account recovery: prove control of the registered email, then replace the
 * phone number (the login identifier).
 *
 * Two properties the frontend depends on:
 *   - `request()` ALWAYS returns success. Whether the email exists is never
 *     revealed, so this endpoint cannot be used to enumerate accounts.
 *   - `confirm()` invalidates the token on use, and rotating the phone
 *     revokes every existing session (the old phone may be compromised).
 */
@Injectable()
export class RecoveryService {
  private readonly logger = new Logger('Recovery');

  constructor(
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
  ) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async request(email: string, ip?: string | null): Promise<{ accepted: true }> {
    const normalizedEmail = email.trim().toLowerCase();

    const userEmail = await this.prisma.userEmail.findUnique({
      where: { email: normalizedEmail },
      select: { userId: true },
    });

    // Uniform response path: when the address is unknown we simply do nothing.
    if (!userEmail) {
      this.logger.debug(`recovery requested for unknown email ${normalizedEmail}`);
      return { accepted: true };
    }

    const token = randomBytes(TOKEN_BYTES).toString('base64url');

    // A new request supersedes any outstanding one for this user.
    await this.prisma.$transaction(async (tx) => {
      await tx.accountRecoveryToken.updateMany({
        where: { userId: userEmail.userId, purpose: 'ACCOUNT_RECOVERY', usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.accountRecoveryToken.create({
        data: {
          userId: userEmail.userId,
          purpose: 'ACCOUNT_RECOVERY',
          tokenHash: this.hashToken(token),
          expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
        },
      });
    });

    // Never log the token itself.
    await this.prisma.otpRequestLog.create({
      data: { userId: userEmail.userId, phone: normalizedEmail, purpose: 'ACCOUNT_RECOVERY', ip: ip ?? null },
    });

    const link = `${this.config.frontendBaseUrl}/account/recovery/confirm?token=${token}`;
    const result = await this.email.send({
      to: normalizedEmail,
      subject: 'بازیابی دسترسی به حساب کاربری',
      text:
        `برای تغییر شمارهٔ موبایل حساب خود روی لینک زیر کلیک کنید.\n` +
        `این لینک تا ۱۵ دقیقه معتبر است و فقط یک بار قابل استفاده است.\n\n${link}\n\n` +
        `اگر این درخواست را شما ثبت نکرده‌اید، این ایمیل را نادیده بگیرید.`,
    });

    if (!result.delivered) {
      // Logged, not surfaced: revealing delivery failure leaks account existence.
      this.logger.error(`recovery email delivery failed for ${normalizedEmail}: ${result.error}`);
    }

    return { accepted: true };
  }

  async confirm(token: string, newPhone: string): Promise<{ phoneUpdated: true }> {
    const phone = normalizePhone(newPhone);
    if (!/^\+989\d{9}$/.test(phone)) {
      throw AppError.badRequest('newPhone must be an Iranian mobile number in E.164 (+989xxxxxxxxx)');
    }

    const record = await this.prisma.accountRecoveryToken.findUnique({
      where: { tokenHash: this.hashToken(token) },
    });

    // Identical error for unknown, used and expired tokens — the token is a
    // secret and must not be probeable.
    if (!record || record.purpose !== 'ACCOUNT_RECOVERY' || record.usedAt) {
      throw new AppError(ErrorCodes.RECOVERY_TOKEN_INVALID, 400, 'Recovery link is invalid or already used');
    }
    if (record.expiresAt <= new Date()) {
      throw new AppError(ErrorCodes.RECOVERY_TOKEN_EXPIRED, 400, 'Recovery link has expired. Request a new one.');
    }

    const phoneTaken = await this.prisma.userPhone.findFirst({
      where: { phone, userId: { not: record.userId } },
      select: { id: true },
    });
    if (phoneTaken) {
      throw AppError.conflict('This phone number is registered to another account', ErrorCodes.PHONE_TAKEN);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.accountRecoveryToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });

      // Demote the old primary phone, then upsert the new one as primary.
      await tx.userPhone.updateMany({
        where: { userId: record.userId, isPrimary: true },
        data: { isPrimary: false },
      });
      await tx.userPhone.upsert({
        where: { phone },
        create: { userId: record.userId, phone, isPrimary: true, verifiedAt: new Date() },
        update: { userId: record.userId, isPrimary: true, verifiedAt: new Date() },
      });

      // The previous phone may be compromised — end every live session.
      await tx.authSession.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'ADMIN' },
      });
    });

    this.logger.log(`phone rotated for user ${record.userId} via account recovery`);
    return { phoneUpdated: true };
  }
}
