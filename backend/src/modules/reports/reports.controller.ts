import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsISO8601, IsOptional } from 'class-validator';
import { Permissions } from '../../common/decorators/auth.decorators';
import { PrismaService } from '../../shared/prisma/prisma.service';

class RangeDto {
  @ApiPropertyOptional({ description: 'ISO-8601 start, inclusive' })
  @IsOptional() @IsISO8601() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() to?: string;
}

/** `@Type()` is a PropertyDecorator, so numeric coercion belongs on a DTO. */
class TopProductsQueryDto extends RangeDto {
  @ApiPropertyOptional({ default: 10, maximum: 100 })
  @IsOptional() @Type(() => Number) limit = 10;
}

/**
 * Admin reporting.
 *
 * Read-only aggregates computed on demand. Volumes are small enough for direct
 * SQL today; the jobs module materializes these into snapshots when they grow.
 *
 * All money is Integer Toman. `revenue` counts only what was actually paid,
 * net of refunds — never the order total, which would overstate income on
 * unpaid or cancelled orders.
 */
@ApiBearerAuth('access-token')
@ApiTags('admin.reports')
@Controller('admin/reports')
export class ReportsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('overview')
  @Permissions('audit.read')
  @ApiOperation({ summary: 'Headline KPIs for a date range' })
  async overview(@Query() range: RangeDto) {
    const from = range.from ? new Date(range.from) : this.startOfDaysAgo(30);
    const to = range.to ? new Date(range.to) : new Date();

    const [orders, paidOrders, revenue, refunds, customers, lowStock] = await Promise.all([
      this.prisma.order.count({ where: { placedAt: { gte: from, lte: to } } }),
      this.prisma.order.count({ where: { placedAt: { gte: from, lte: to }, paidAt: { not: null } } }),
      this.prisma.order.aggregate({
        where: { placedAt: { gte: from, lte: to }, paidAt: { not: null } },
        _sum: { paidAmount: true, refundedAmount: true },
      }),
      this.prisma.refund.count({ where: { createdAt: { gte: from, lte: to }, status: 'COMPLETED' } }),
      this.prisma.user.count({ where: { createdAt: { gte: from, lte: to } } }),
      this.prisma.inventory.count({ where: { onHand: { lte: 3 } } }),
    ]);

    const gross = revenue._sum.paidAmount ?? 0;
    const refunded = revenue._sum.refundedAmount ?? 0;

    return {
      range: { from, to },
      orders: {
        total: orders,
        paid: paidOrders,
        // Integer division on Toman would truncate; round to 2 decimals only
        // for the displayed conversion rate.
        conversionPercent: orders > 0 ? Math.round((paidOrders / orders) * 10000) / 100 : 0,
        averageOrderValue: paidOrders > 0 ? Math.round(gross / paidOrders) : 0,
      },
      money: { grossRevenue: gross, refunded, netRevenue: gross - refunded, currency: 'IRT' },
      refunds: { completed: refunds },
      customers: { new: customers },
      inventory: { lowStockVariants: lowStock },
    };
  }

  @Get('top-products')
  @Permissions('audit.read')
  async topProducts(@Query() query: TopProductsQueryDto) {
    const range = query;
    const from = range.from ? new Date(range.from) : this.startOfDaysAgo(30);
    const to = range.to ? new Date(range.to) : new Date();

    const items = await this.prisma.orderItem.findMany({
      where: { order: { paidAt: { not: null, gte: from, lte: to } } },
      select: { productId: true, productName: true, quantity: true, lineTotal: true },
    });

    // Aggregated in memory: the row count for a 30-day window is modest, and
    // doing it here keeps the query simple and index-friendly.
    const byProduct = new Map<string, { name: string; units: number; revenue: number }>();
    for (const i of items) {
      const entry = byProduct.get(i.productId) ?? { name: i.productName, units: 0, revenue: 0 };
      entry.units += i.quantity;
      entry.revenue += i.lineTotal;
      byProduct.set(i.productId, entry);
    }

    return [...byProduct.entries()]
      .map(([productId, v]) => ({ productId, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, Math.min(Math.max(query.limit, 1), 100));
  }

  @Get('orders-by-status')
  @Permissions('audit.read')
  async ordersByStatus() {
    const grouped = await this.prisma.order.groupBy({ by: ['status'], _count: { _all: true } });
    return grouped.map((g) => ({ status: g.status, count: g._count._all }));
  }

  private startOfDaysAgo(days: number): Date {
    const d = new Date();
    d.setDate(d.getDate() - days);
    d.setHours(0, 0, 0, 0);
    return d;
  }
}
