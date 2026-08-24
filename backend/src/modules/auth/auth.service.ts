import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { OtpService } from './otp.service';
import { SessionService, SessionTokens } from './session.service';

export interface LoginResult extends SessionTokens {
  userId: string;
  roles: string[];
}

/** Phone-OTP login: verify → find-or-create account → session. */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly sessions: SessionService,
  ) {}

  async loginWithOtp(input: {
    phone: string; code: string; ip?: string | null; userAgent?: string | null;
    deviceKind?: string; deviceName?: string;
  }): Promise<LoginResult> {
    const phone = await this.otp.verify(input.phone, input.code); // atomic single-use
    const { user, roles } = await this.prisma.$transaction(async (tx) => {
      const existingPhone = await tx.userPhone.findUnique({
        where: { phone }, include: { user: { include: { roles: { include: { role: true } } } } },
      });
      let userId: string;
      let roleSlugs: string[];
      if (existingPhone) {
        if (existingPhone.user.status === 'DELETED') {
          await tx.user.update({ where: { id: existingPhone.userId }, data: { status: 'ACTIVE' } });
        }
        userId = existingPhone.userId;
        roleSlugs = existingPhone.user.roles.map((r) => r.role.slug);
        if (!existingPhone.verifiedAt) {
          await tx.userPhone.update({ where: { id: existingPhone.id }, data: { verifiedAt: new Date() } });
        }
      } else {
        const customer = await tx.role.findUnique({ where: { slug: 'CUSTOMER' } });
        const created = await tx.user.create({
          data: {
            status: 'ACTIVE',
            phones: { create: { phone, isPrimary: true, verifiedAt: new Date() } },
            roles: customer ? { create: [{ roleId: customer.id }] } : undefined,
          },
        });
        userId = created.id;
        roleSlugs = ['CUSTOMER'];
      }
      const fresh = await tx.user.findUniqueOrThrow({
        where: { id: userId }, include: { roles: { include: { role: true } } },
      });
      if (fresh.status === 'BLOCKED') {
        const { AppError } = await import('../../common/errors/app-error');
        const { ErrorCodes } = await import('../../common/errors/error-codes');
        throw new AppError(ErrorCodes.USER_BLOCKED, 403, 'Account is blocked');
      }
      return { user: fresh, roles: roleSlugs.length ? roleSlugs : fresh.roles.map((r) => r.role.slug) };
    });

    const tokens = await this.sessions.issue({
      userId: user.id, roles, ip: input.ip, userAgent: input.userAgent,
      deviceKind: input.deviceKind, deviceName: input.deviceName,
    });
    return { userId: user.id, roles, ...tokens };
  }
}
