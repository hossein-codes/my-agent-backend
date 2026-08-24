import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { Permissions, CurrentUser, type AuthenticatedUser } from '../../common/decorators/auth.decorators';
import { PaginationDto, paginated } from '../../common/dto/pagination.dto';
import { AppError } from '../../common/errors/app-error';
import { ErrorCodes } from '../../common/errors/error-codes';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { RefundsService } from './refunds.service';

class CreateRefundDto {
  @ApiProperty() @IsUUID() orderId!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() returnRequestId?: string;
  @ApiPropertyOptional({ description: 'Toman; derived from the approved return when omitted' })
  @IsOptional() @IsInt() @Min(1) amount?: number;
  @ApiPropertyOptional({ enum: ['GATEWAY', 'MANUAL_BANK_TRANSFER', 'STORE_CREDIT'] })
  @IsOptional() @IsIn(['GATEWAY', 'MANUAL_BANK_TRANSFER', 'STORE_CREDIT'])
  method?: 'GATEWAY' | 'MANUAL_BANK_TRANSFER' | 'STORE_CREDIT';
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) note?: string;
}

@ApiBearerAuth('access-token')
@ApiTags('admin.refunds')
@Controller('admin/refunds')
export class RefundsAdminController {
  constructor(
    private readonly refunds: RefundsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @Permissions('payment.read')
  async list(@Query() pagination: PaginationDto, @Query('status') status?: string) {
    const where = status ? { status: status as never } : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.refund.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
        include: { order: { select: { orderNumber: true, paidAmount: true, refundedAmount: true } } },
      }),
      this.prisma.refund.count({ where }),
    ]);
    return paginated(items, pagination, total);
  }

  @Post()
  @Permissions('refund.create')
  create(@Body() dto: CreateRefundDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.refunds.create({
      orderId: dto.orderId,
      returnRequestId: dto.returnRequestId,
      amount: dto.amount,
      method: dto.method,
      note: dto.note,
      actorId: actor.userId,
    });
  }

  @Post(':id/complete')
  @Permissions('refund.approve')
  async complete(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    const refund = await this.prisma.refund.findUnique({ where: { id } });
    if (!refund) throw AppError.notFound('Refund not found', ErrorCodes.NOT_FOUND);
    return this.refunds.complete(id, actor.userId);
  }
}

@ApiBearerAuth('access-token')
@ApiTags('refunds')
@Controller('refunds')
export class RefundsController {
  constructor(private readonly prisma: PrismaService) {}

  /** A customer sees only refunds on their own orders. */
  @Get('me')
  async mine(@CurrentUser() user: AuthenticatedUser, @Query() pagination: PaginationDto) {
    const where = { order: { userId: user.userId } };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.refund.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
        select: {
          id: true,
          refundNumber: true,
          amount: true,
          method: true,
          status: true,
          processedAt: true,
          createdAt: true,
          order: { select: { orderNumber: true } },
        },
      }),
      this.prisma.refund.count({ where }),
    ]);
    return paginated(items, pagination, total);
  }
}
