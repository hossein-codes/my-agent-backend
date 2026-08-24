import { Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { Request, Response } from 'express';
import { AppConfigService } from '../../config/app-config.service';
import { PaymentService } from './payment.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CurrentUser, AuthenticatedUser, Public } from '../../common/decorators/auth.decorators';
import { RateLimit } from '../../common/rate-limit/rate-limits';
import { RateLimitGuard } from '../../common/rate-limit/rate-limit.guard';
import { AppError } from '../../common/errors/app-error';
import { ErrorCodes } from '../../common/errors/error-codes';

class CallbackQuery { authority?: string; Authority?: string; Status?: string; status?: string; }
class WebhookDto {
  @IsOptional() @IsString() authority?: string;
  @IsOptional() @IsString() externalId?: string;
  @IsOptional() @IsString() eventType?: string;
}

/**
 * Provider-facing endpoints. The redirect callback NEVER marks anything
 * successful (spec §15) — it only triggers server-side provider
 * verification; state changes happen exclusively inside verifyAndSettle.
 */
@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly payments: PaymentService,
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  @Get('callback')
  @Public()
  @UseGuards(RateLimitGuard) @RateLimit('payment.callback')
  @ApiExcludeEndpoint()
  async redirectCallback(@Query() q: CallbackQuery, @Res() res: Response) {
    const authority = q.authority ?? q.Authority;
    const result = await this.payments.handleCallback({ authority, status: q.Status ?? q.status });
    const ok = result.outcome === 'OK';
    const orderNumber = authority ? await this.orderNumberForAuthority(authority) : null;
    const base = ok ? 'payment-success' : 'payment-failed';
    // Absolute URL against the FRONTEND origin: a relative redirect would land
    // on the API's own domain and the shopper would never see the result page.
    const target = `${this.config.frontendBaseUrl}/payment-result?status=${base}${orderNumber ? `&order=${encodeURIComponent(orderNumber)}` : ''}`;
    res.redirect(302, target);
  }

  @Post('webhook')
  @Public()
  @UseGuards(RateLimitGuard) @RateLimit('payment.callback')
  async webhook(@Body() dto: WebhookDto) {
    const result = await this.payments.handleCallback({
      authority: dto.authority, externalId: dto.externalId, eventType: dto.eventType, payload: dto,
    });
    return { processed: true, outcome: result.outcome };
  }

  /** Customer-initiated retry/verify — safe to call repeatedly (idempotent). */
  @Post('verify')
  @Public()
  @UseGuards(RateLimitGuard) @RateLimit('payment.callback')
  async verify(@Body('authority') authority: string) {
    const attempt = await this.prisma.paymentAttempt.findFirst({
      where: { providerAuthority: authority },
      include: { payment: { include: { order: { select: { userId: true, orderNumber: true, status: true } } } } },
    });
    if (!attempt) throw new AppError(ErrorCodes.NOT_FOUND, 404, 'Unknown authority');
    const result = await this.payments.verifyAndSettle(authority);
    const freshOrder = await this.prisma.order.findUniqueOrThrow({
      where: { id: attempt.payment.orderId }, select: { status: true },
    });
    return {
      orderNumber: attempt.payment.order.orderNumber,
      orderStatus: freshOrder.status,
      settled: result.settled, alreadySettled: result.alreadySettled ?? false,
    };
  }

  private async orderNumberForAuthority(authority: string): Promise<string | null> {
    const attempt = await this.prisma.paymentAttempt.findFirst({
      where: { providerAuthority: authority }, include: { payment: { include: { order: true } } },
    });
    return attempt?.payment.order.orderNumber ?? null;
  }
}

@ApiBearerAuth('access-token')
@ApiTags('payments')
@Controller('payments')
export class PaymentsCustomerController {
  constructor(private readonly payments: PaymentService) {}

  /** Initiate (or resume) payment for an owned order. Amount is server-derived. */
  @Post('orders/:orderId/initiate')
  @UseGuards(RateLimitGuard) @RateLimit('payment.initiate')
  async initiate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
    @Body('idempotencyKey') idempotencyKey?: string,
    @Req() _req?: Request,
  ) {
    return this.payments.initiate(user.userId, orderId, idempotencyKey);
  }
}
