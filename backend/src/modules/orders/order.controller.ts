import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { CurrentUser, Permissions, type AuthenticatedUser } from '../../common/decorators/auth.decorators';
import { PaginationDto, paginated } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { OrderService } from './order.service';

class CancelDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) reason?: string;
}

@ApiBearerAuth('access-token')
@ApiTags('orders')
@Controller('orders')
export class OrderController {
  constructor(private readonly orders: OrderService) {}

  @Get()
  @ApiOperation({ summary: 'My orders, newest first' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() pagination: PaginationDto, @Query('status') status?: string) {
    const result = await this.orders.listForUser(user.userId, pagination.page, pagination.pageSize, status);
    return paginated(result.items, pagination, result.total);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One of my orders, with items, totals, shipments and history' })
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.orders.getForUser(user.userId, id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel my order while it has not shipped' })
  async cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: CancelDto) {
    const order = await this.orders.cancelByUser(user.userId, id, dto.reason);
    return { cancelled: true, status: order.status };
  }
}

class TransitionDto {
  @ApiProperty({ example: 'PROCESSING' }) @IsString() @MaxLength(32) status!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) reason?: string;
}

class ShipmentDto {
  @ApiProperty() @IsString() @MaxLength(120) carrierName!: string;
  @ApiProperty() @IsString() @Matches(/^[A-Za-z0-9-]{4,64}$/, { message: 'trackingNumber looks invalid' })
  trackingNumber!: string;
}

@ApiBearerAuth('access-token')
@ApiTags('admin.orders')
@Controller('admin/orders')
export class AdminOrderController {
  constructor(
    private readonly orders: OrderService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @Permissions('order.read')
  async list(@Query() pagination: PaginationDto, @Query('status') status?: string, @Query('q') q?: string) {
    const where = {
      ...(status ? { status: status as never } : {}),
      ...(q
        ? {
            OR: [
              { orderNumber: { contains: q, mode: 'insensitive' as const } },
              { contactPhone: { contains: q } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        orderBy: { placedAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
        include: {
          _count: { select: { items: true } },
          address: { select: { provinceName: true, cityName: true, receiverFirstName: true, receiverLastName: true } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);
    return paginated(
      items.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        totalAmount: o.totalAmount,
        paidAmount: o.paidAmount,
        refundedAmount: o.refundedAmount,
        contactPhone: o.contactPhone,
        placedAt: o.placedAt,
        itemCount: o._count.items,
        city: o.address ? `${o.address.provinceName} — ${o.address.cityName}` : null,
        receiver: o.address ? `${o.address.receiverFirstName} ${o.address.receiverLastName}` : null,
      })),
      pagination,
      total,
    );
  }

  @Get(':id')
  @Permissions('order.read')
  get(@Param('id') id: string) {
    // Reuses the customer projection so admin and storefront render identically.
    // getForAdmin throws 404 when the order does not exist.
    return this.orders.getForAdmin(id);
  }

  @Post(':id/transition')
  @Permissions('order.manage')
  async transition(@Param('id') id: string, @Body() dto: TransitionDto, @CurrentUser() actor: AuthenticatedUser) {
    const order = await this.orders.transition(id, dto.status, 'ADMIN', actor.userId, dto.reason);
    return { status: order.status };
  }

  @Post(':id/ship')
  @Permissions('order.manage')
  async ship(@Param('id') id: string, @Body() dto: ShipmentDto, @CurrentUser() actor: AuthenticatedUser) {
    const shipment = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUniqueOrThrow({ where: { id } });
      const created = await tx.shipment.create({
        data: {
          shipmentNumber: `SH-${order.orderNumber}`,
          orderId: id,
          carrierName: dto.carrierName,
          trackingNumber: dto.trackingNumber,
          status: 'SHIPPED',
          shippedAt: new Date(),
          items: {
            create: (
              await tx.orderItem.findMany({ where: { orderId: id }, select: { id: true, quantity: true, shippedQuantity: true } })
            )
              .filter((i) => i.quantity > i.shippedQuantity)
              .map((i) => ({ orderItemId: i.id, quantity: i.quantity - i.shippedQuantity })),
          },
        },
      });

      // Mark the fulfilled quantity so a second shipment cannot re-ship it.
      const items = await tx.orderItem.findMany({ where: { orderId: id }, select: { id: true, quantity: true } });
      for (const item of items) {
        await tx.orderItem.update({ where: { id: item.id }, data: { shippedQuantity: item.quantity } });
      }

      return created;
    });

    await this.orders.transition(id, 'SHIPPED', 'ADMIN', actor.userId, `tracking ${dto.trackingNumber}`);
    return { shipmentId: shipment.id, shipmentNumber: shipment.shipmentNumber };
  }
}
