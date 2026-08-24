import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { createCipheriv, createDecipheriv, createHmac, randomBytes, scryptSync } from 'node:crypto';
import { Permissions, CurrentUser, type AuthenticatedUser } from '../../common/decorators/auth.decorators';
import { PaginationDto, paginated } from '../../common/dto/pagination.dto';
import { AppError } from '../../common/errors/app-error';
import { ErrorCodes } from '../../common/errors/error-codes';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

class SubmitIdentityDto {
  @ApiProperty({ example: '0012345678', description: '10-digit national code' })
  @Matches(/^\d{10}$/, { message: 'nationalCode must be exactly 10 digits' })
  nationalCode!: string;
}

class ReviewDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED'] }) @IsIn(['APPROVED', 'REJECTED']) decision!: 'APPROVED' | 'REJECTED';
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) note?: string;
}

/**
 * AES-256-GCM at the application layer (spec §19/§24).
 *
 * The national code is encrypted before it reaches Postgres, with a random IV
 * per value, so a database dump yields nothing usable. A separate HMAC gives
 * uniqueness/duplicate checking WITHOUT ever decrypting — that is what
 * `nationalIdHash` is for.
 */
function deriveKey(secret: string, context: string): Buffer {
  return scryptSync(secret, context, 32);
}

function encrypt(plaintext: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret, 'identity-enc-v1'), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

function decrypt(payload: string, secret: string): string {
  const [version, ivB64, tagB64, dataB64] = payload.split(':');
  if (version !== 'v1' || !ivB64 || !tagB64 || !dataB64) {
    throw AppError.internal('Unsupported identity payload version');
  }
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(secret, 'identity-enc-v1'), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}

/** Blind index: lets us detect a reused national code without decrypting. */
function hashNationalId(plaintext: string, pepper: string): string {
  return createHmac('sha256', deriveKey(pepper, 'identity-hmac-v1')).update(plaintext).digest('hex');
}

/**
 * Optional identity (KYC) verification.
 *
 * The plaintext national code is NEVER stored, logged, or returned. Admin
 * review decrypts only the record being looked at, and every decryption is
 * audit-logged so access is attributable.
 *
 * Note the schema deliberately holds no name columns here — identity data
 * lives ONLY in this table, encrypted.
 */
@ApiBearerAuth('access-token')
@ApiTags('identity')
@Controller('identity')
export class IdentityController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  @Post('requests')
  async submit(@CurrentUser() user: AuthenticatedUser, @Body() dto: SubmitIdentityDto) {
    const inFlight = await this.prisma.identityVerificationRequest.findFirst({
      where: { userId: user.userId, status: { in: ['PENDING', 'IN_PROGRESS', 'APPROVED'] } },
      select: { id: true, status: true },
      orderBy: { requestedAt: 'desc' },
    });
    if (inFlight?.status === 'APPROVED') {
      throw AppError.conflict('Your identity is already verified', ErrorCodes.CONFLICT);
    }
    if (inFlight) {
      throw AppError.conflict('You already have a request under review', ErrorCodes.CONFLICT);
    }

    const nationalIdHash = hashNationalId(dto.nationalCode, this.config.dataEncryptionKey);

    // Blind-index check: the same national code cannot back two accounts, and
    // this is decided without decrypting any existing record.
    const alreadyUsed = await this.prisma.identityVerificationRequest.findFirst({
      where: { nationalIdHash, userId: { not: user.userId } },
      select: { id: true },
    });
    if (alreadyUsed) {
      throw AppError.conflict('This national code is already linked to another account', ErrorCodes.CONFLICT);
    }

    const request = await this.prisma.identityVerificationRequest.create({
      data: {
        userId: user.userId,
        // Provider-agnostic: the mock provider records intent only; a real KYC
        // provider would be selected here and its reference stored.
        provider: this.config.identityProvider,
        status: 'PENDING',
        nationalIdEncrypted: encrypt(dto.nationalCode, this.config.dataEncryptionKey),
        nationalIdHash,
      },
    });
    return { id: request.id, status: request.status };
  }

  @Get('me')
  async mine(@CurrentUser() user: AuthenticatedUser) {
    const request = await this.prisma.identityVerificationRequest.findFirst({
      where: { userId: user.userId },
      orderBy: { requestedAt: 'desc' },
      // The ciphertext is never sent to the client.
      select: { id: true, status: true, requestedAt: true, verifiedAt: true, failureReason: true },
    });
    return request ?? { status: 'NOT_SUBMITTED' };
  }
}

@ApiBearerAuth('access-token')
@ApiTags('admin.identity')
@Controller('admin/identity')
export class AdminIdentityController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
  ) {}

  @Get('requests')
  @Permissions('identity.review')
  async queue(@Query() pagination: PaginationDto, @Query('status') status?: string) {
    const where = { status: (status ?? 'PENDING') as never };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.identityVerificationRequest.findMany({
        where,
        orderBy: { requestedAt: 'asc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.identityVerificationRequest.count({ where }),
    ]);
    return paginated(
      items.map((r) => ({
        id: r.id,
        status: r.status,
        provider: r.provider,
        requestedAt: r.requestedAt,
        verifiedAt: r.verifiedAt,
        failureReason: r.failureReason,
        // The national code is deliberately absent from the list view.
        hasNationalId: Boolean(r.nationalIdEncrypted),
      })),
      pagination,
      total,
    );
  }

  /** Decrypts one record on demand and records who looked at it. */
  @Get('requests/:id/national-code')
  @Permissions('identity.review')
  async revealNationalCode(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    const request = await this.prisma.identityVerificationRequest.findUnique({ where: { id } });
    if (!request) throw AppError.notFound('Request not found', ErrorCodes.NOT_FOUND);
    if (!request.nationalIdEncrypted) {
      throw AppError.notFound('No national code was submitted for this request', ErrorCodes.NOT_FOUND);
    }

    const nationalCode = decrypt(request.nationalIdEncrypted, this.config.dataEncryptionKey);
    // Deliberately does NOT log the value — only that it was read, and by whom.
    await this.audit.record(
      { actorType: 'ADMIN', actorId: actor.userId },
      { action: 'IDENTITY_NATIONAL_CODE_VIEWED', entityType: 'IdentityVerificationRequest', entityId: id },
    );
    return { nationalCode };
  }

  @Post('requests/:id/review')
  @Permissions('identity.review')
  async review(@Param('id') id: string, @Body() dto: ReviewDto, @CurrentUser() actor: AuthenticatedUser) {
    const request = await this.prisma.identityVerificationRequest.findUnique({ where: { id } });
    if (!request) throw AppError.notFound('Request not found', ErrorCodes.NOT_FOUND);

    const updated = await this.prisma.identityVerificationRequest.update({
      where: { id },
      data: {
        status: dto.decision,
        verifiedAt: dto.decision === 'APPROVED' ? new Date() : null,
        failureReason: dto.decision === 'REJECTED' ? (dto.note ?? 'rejected by reviewer') : null,
        // The acting admin is captured in the audit log; this table has no
        // reviewer column by design.
      },
    });

    await this.audit.record(
      { actorType: 'ADMIN', actorId: actor.userId },
      {
        action: `IDENTITY_${dto.decision}`,
        entityType: 'IdentityVerificationRequest',
        entityId: id,
        oldValues: { status: request.status },
        newValues: { status: updated.status },
      },
    );
    return { status: updated.status };
  }
}
