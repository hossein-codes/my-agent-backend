import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { randomInt } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { Permissions, CurrentUser, type AuthenticatedUser } from '../../common/decorators/auth.decorators';
import { PaginationDto, paginated } from '../../common/dto/pagination.dto';
import { AppError } from '../../common/errors/app-error';
import { ErrorCodes } from '../../common/errors/error-codes';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { NotificationService } from '../notifications/notification.service';
import { AuditService } from '../audit/audit.service';

const RETURN_REASONS = [
  'WRONG_SIZE',
  'DEFECTIVE',
  'NOT_AS_DESCRIBED',
  'DAMAGED_IN_TRANSIT',
  'CHANGED_MIND',
  'OTHER',
] as const;
type ReturnReason = (typeof RETURN_REASONS)[number];

class ReturnItemDto {
  @ApiProperty() @IsUUID() orderItemId!: string;
  @ApiProperty() @IsInt() @Min(1) requestedQuantity!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) reason?: string;
  @ApiPropertyOptional({ description: 'UNOPENED | OPENED | DEFECTIVE' })
  @IsOptional() @IsString() @MaxLength(40) condition?: string;
}

class ReturnRequestDto {
  @ApiProperty({ enum: ['REFUND', 'EXCHANGE'] }) @IsIn(['REFUND', 'EXCHANGE']) type!: 'REFUND' | 'EXCHANGE';
  @ApiProperty({ enum: RETURN_REASONS as unknown as string[] }) @IsIn(RETURN_REASONS as unknown as string[])
  reason!: ReturnReason;
  @ApiProperty({ type: [ReturnItemDto] }) @IsArray() items!: ReturnItemDto[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) description?: string;
}

class ReviewReturnDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED'] }) @IsIn(['APPROVED', 'REJECTED']) decision!: 'APPROVED' | 'REJECTED';
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) note?: string;
}

/**
 * Returns and exchanges.
 *
 * Eligibility is server-decided (spec §27):
 *   - the order must belong to the caller and have been delivered
 *   - the request must fall inside `RETURN_WINDOW_DAYS` of delivery
 *   - the requested quantity cannot exceed what was bought minus what has
 *     already been returned or refunded
 *
 * Nothing is refunded here: approving only creates the entitlement, and the
 * refunds module moves the money. An EXCHANGE never rewrites the original
 * OrderItem (spec §24).
 */
@ApiBearerAuth('access-token')
@ApiTags('returns')
@Controller('returns')
export class ReturnsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly notifications: NotificationService,
  ) {}

  @Post()
  async request(@CurrentUser() user: AuthenticatedUser, @Body() dto: ReturnRequestDto) {
    if (dto.items.length === 0) throw AppError.badRequest('At least one item is required');

    const created = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const orderItems = await tx.orderItem.findMany({
        where: { id: { in: dto.items.map((i) => i.orderItemId) }, order: { userId: user.userId } },
        include: { order: true },
      });
      if (orderItems.length !== dto.items.length) {
        throw AppError.notFound('One or more order items were not found', ErrorCodes.NOT_FOUND);
      }

      const order = orderItems[0].order;
      if (orderItems.some((i) => i.orderId !== order.id)) {
        throw AppError.badRequest('All items must belong to the same order');
      }
      if (!order.deliveredAt) {
        throw new AppError(ErrorCodes.RETURN_NOT_ELIGIBLE, 422, 'Only delivered orders can be returned');
      }

      const windowEnd = new Date(order.deliveredAt.getTime() + this.config.business.returnWindowDays * 86_400_000);
      if (new Date() > windowEnd) {
        throw new AppError(
          ErrorCodes.RETURN_WINDOW_CLOSED,
          422,
          `The ${this.config.business.returnWindowDays}-day return window closed on ${windowEnd.toISOString().slice(0, 10)}`,
        );
      }

      for (const requested of dto.items) {
        const item = orderItems.find((i) => i.id === requested.orderItemId);
        if (!item) throw AppError.notFound('Order item not found', ErrorCodes.NOT_FOUND);
        const remaining = item.quantity - item.returnedQuantity - item.refundedQuantity;
        if (requested.requestedQuantity > remaining) {
          throw AppError.badRequest(
            `Only ${remaining} unit(s) of "${item.productName}" can still be returned`,
          );
        }
      }

      const returnNumber = await this.generateReturnNumber(tx);
      return tx.returnRequest.create({
        data: {
          returnNumber,
          orderId: order.id,
          userId: user.userId,
          type: dto.type,
          reason: dto.reason,
          status: 'REQUESTED',
          description: dto.description ?? null,
          items: {
            create: dto.items.map((i) => ({
              orderItemId: i.orderItemId,
              requestedQuantity: i.requestedQuantity,
              reason: i.reason ?? null,
              condition: i.condition ?? null,
              status: 'PENDING',
            })),
          },
        },
        include: { items: true },
      });
    });

    // The order moves to RETURN_REQUESTED only after the request is committed,
    // so a rejected request never leaves the order in a wrong state.
    const order = await this.prisma.order.findUnique({ where: { id: created.orderId } });
    if (order && order.status === 'DELIVERED') {
      await this.prisma.order.update({ where: { id: order.id }, data: { status: 'RETURN_REQUESTED' } });
    }

    await this.notifications.notify({
      userId: user.userId,
      type: 'RETURN_REQUESTED',
      title: 'درخواست مرجوعی ثبت شد',
      body: `درخواست ${created.returnNumber} ثبت شد و در حال بررسی است.`,
      dedupeKey: `return:${created.id}:REQUESTED`,
      channels: ['IN_APP'],
    });

    return { id: created.id, returnNumber: created.returnNumber, status: created.status, itemCount: created.items.length };
  }

  @Get()
  async mine(@CurrentUser() user: AuthenticatedUser, @Query() pagination: PaginationDto) {
    const where = { userId: user.userId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.returnRequest.findMany({
        where,
        orderBy: { requestedAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
        include: { order: { select: { orderNumber: true } }, items: true },
      }),
      this.prisma.returnRequest.count({ where }),
    ]);
    return paginated(items, pagination, total);
  }

  @Get(':id')
  async detail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    // Ownership in the query — a foreign return is indistinguishable from a
    // missing one.
    const request = await this.prisma.returnRequest.findFirst({
      where: { id, userId: user.userId },
      include: { order: { select: { orderNumber: true, totalAmount: true } }, items: { include: { orderItem: { select: { productName: true, variantSku: true, finalUnitPrice: true } } } } },
    });
    if (!request) throw AppError.notFound('Return request not found', ErrorCodes.NOT_FOUND);
    return request;
  }

  /** Public, collision-safe: `RT-YYMMDD-XXXXXX`. */
  private async generateReturnNumber(tx: Prisma.TransactionClient): Promise<string> {
    const now = new Date();
    const ymd = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const candidate = `RT-${ymd}-${String(randomInt(0, 1_000_000)).padStart(6, '0')}`;
      const clash = await tx.returnRequest.findUnique({ where: { returnNumber: candidate }, select: { id: true } });
      if (!clash) return candidate;
    }
    throw AppError.conflict('Could not allocate a return number. Please retry.');
  }
}

@ApiBearerAuth('access-token')
@ApiTags('admin.returns')
@Controller('admin/returns')
export class AdminReturnsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @Permissions('order.read')
  async queue(@Query() pagination: PaginationDto, @Query('status') status?: string) {
    const where = { status: (status ?? 'REQUESTED') as never };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.returnRequest.findMany({
        where,
        orderBy: { requestedAt: 'asc' },
        skip: pagination.skip,
        take: pagination.take,
        include: { order: { select: { orderNumber: true } }, items: true },
      }),
      this.prisma.returnRequest.count({ where }),
    ]);
    return paginated(items, pagination, total);
  }

  /**
   * Approves or rejects. Approval sets `approvedQuantity` on each item, which
   * the refunds module reads to size the payout — a partial approval is simply
   * a smaller approved quantity.
   */
  @Post(':id/review')
  @Permissions('order.manage')
  async review(@Param('id') id: string, @Body() dto: ReviewReturnDto, @CurrentUser() actor: AuthenticatedUser) {
    const existing = await this.prisma.returnRequest.findUnique({ where: { id } });
    if (!existing) throw AppError.notFound('Return request not found', ErrorCodes.NOT_FOUND);

    const updated = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const next = await tx.returnRequest.update({
        where: { id },
        data: {
          status: dto.decision === 'APPROVED' ? 'APPROVED' : 'REJECTED',
          reviewedAt: new Date(),
          // The acting admin is captured in the audit log; this table records
          // only the reviewer's note.
          adminNote: dto.note ?? null,
        },
      });

      const items = await tx.returnItem.findMany({ where: { returnRequestId: id } });
      for (const item of items) {
        await tx.returnItem.update({
          where: { id: item.id },
          data: {
            status: dto.decision === 'APPROVED' ? 'APPROVED' : 'REJECTED',
            // Full approval by default; a partial approval is a follow-up patch.
            approvedQuantity: dto.decision === 'APPROVED' ? item.requestedQuantity : 0,
          },
        });
        if (dto.decision === 'APPROVED') {
          await tx.orderItem.update({
            where: { id: item.orderItemId },
            data: { returnedQuantity: { increment: item.requestedQuantity } },
          });
        }
      }
      return next;
    });

    await this.notifications.notify({
      userId: existing.userId,
      type: dto.decision === 'APPROVED' ? 'RETURN_APPROVED' : 'RETURN_REJECTED',
      title: dto.decision === 'APPROVED' ? 'درخواست مرجوعی تأیید شد' : 'درخواست مرجوعی رد شد',
      body: dto.note ?? 'جزئیات را در صفحهٔ سفارش ببینید.',
      dedupeKey: `return:${id}:${dto.decision}`,
      channels: ['IN_APP', 'SMS'],
    });

    await this.audit.record(
      { actorType: 'ADMIN', actorId: actor.userId },
      {
        action: `RETURN_${dto.decision}`,
        entityType: 'ReturnRequest',
        entityId: id,
        oldValues: { status: existing.status },
        newValues: { status: updated.status, note: dto.note ?? null },
      },
    );

    return { status: updated.status };
  }
}
