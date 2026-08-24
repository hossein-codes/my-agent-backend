import { Body, Controller, Delete, Get, HttpCode, Ip, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AppConfigService } from '../../config/app-config.service';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { SessionService } from './session.service';
import { RecoveryService } from './recovery.service';
import { OtpRequestDto, OtpVerifyDto, RefreshDto, RecoveryConfirmDto, RecoveryRequestDto } from './dto/auth.dto';
import { Public, CurrentUser, AuthenticatedUser, Permissions } from '../../common/decorators/auth.decorators';
import { RateLimit } from '../../common/rate-limit/rate-limits';
import { RateLimitGuard } from '../../common/rate-limit/rate-limit.guard';
import { AppError } from '../../common/errors/app-error';
import { ErrorCodes } from '../../common/errors/error-codes';

const REFRESH_COOKIE = 'refresh_token';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly otp: OtpService,
    private readonly sessions: SessionService,
    private readonly recovery: RecoveryService,
    private readonly appConfig: AppConfigService,
  ) {}

  private setRefreshCookie(res: Response, token: string, req: Request): void {
    const secure = (req as Request & { secure?: boolean }).secure ?? false;

    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: this.appConfig.authCookieSecure, // L-4 FIX: honor AUTH_COOKIE_SECURE
      sameSite: 'lax',
      path: '/api/v1/auth',
      maxAge: 30 * 86_400_000,
    });
  }

  @Post('otp/request')
  @Public()
  @HttpCode(200)
  @UseGuards(RateLimitGuard) @RateLimit('otp.request')
  async requestOtp(@Body() dto: OtpRequestDto, @Ip() ip: string, @Req() req: Request) {
    return this.otp.request(dto.phone, ip, req.headers['user-agent'] ?? null);
  }

  @Post('otp/verify')
  @Public()
  @HttpCode(200)
  @UseGuards(RateLimitGuard) @RateLimit('otp.verify')
  async verifyOtp(
    @Body() dto: OtpVerifyDto,
    @Ip() ip: string, @Req() req: Request, @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.loginWithOtp({
      phone: dto.phone, code: dto.code, ip, userAgent: req.headers['user-agent'] ?? null,
      deviceKind: dto.deviceKind ?? 'WEB', deviceName: dto.deviceName,
    });
    this.setRefreshCookie(res, result.refreshToken, req);
    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      refreshToken: dto.deviceKind && dto.deviceKind !== 'WEB' ? result.refreshToken : undefined,
      userId: result.userId,
      roles: result.roles,
    };
  }

  @Post('refresh')
  @Public()
  @HttpCode(200)
  @UseGuards(RateLimitGuard) @RateLimit('session.refresh')
  async refresh(@Body() dto: RefreshDto, @Req() req: Request, @Res({ passthrough: true }) res: Response, @Ip() ip: string) {
    const token = dto.refreshToken ?? (req.cookies?.[REFRESH_COOKIE] as string | undefined);
    if (!token) throw AppError.unauthorized('Refresh token missing', ErrorCodes.SESSION_EXPIRED);
    const tokens = await this.sessions.refresh(token, ip, req.headers['user-agent'] ?? null);
    this.setRefreshCookie(res, tokens.refreshToken, req);
    return { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn, refreshToken: dto.refreshToken ? tokens.refreshToken : undefined };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @CurrentUser() user: AuthenticatedUser) {
    await this.sessions.logout(req.cookies?.[REFRESH_COOKIE] as string | undefined, user.sessionId);
    return { revoked: true };
  }

  @Get('sessions')
  async sessionsList(@CurrentUser() user: AuthenticatedUser) {
    return this.sessions.listSessions(user.userId);
  }

  @Delete('sessions/:id')
  async revokeOwnSession(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const owned = await this.sessions.listSessions(user.userId);
    if (!owned.some((s) => s.id === id)) throw AppError.notFound();
    await this.sessions.revokeSession(undefined, id);
    return { revoked: true };
  }

  @Post('recovery/request')
  @Public() @HttpCode(200)
  @UseGuards(RateLimitGuard) @RateLimit('recovery.request')
  async requestRecovery(@Body() dto: RecoveryRequestDto, @Ip() ip: string) {
    await this.recovery.request(dto.email, ip);
    return { accepted: true }; // uniform — never reveals email existence
  }

  @Post('recovery/confirm')
  @Public() @HttpCode(200)
  @UseGuards(RateLimitGuard) @RateLimit('recovery.confirm') // M-8
  async confirmRecovery(@Body() dto: RecoveryConfirmDto) {
    await this.recovery.confirm(dto.token, dto.newPhone);
    return { phoneUpdated: true };
  }
}

@ApiTags('admin.users')
@Controller('admin/users')
export class AdminSessionController {
  constructor(private readonly sessions: SessionService) {}

  @Delete(':userId/sessions/:sessionId')
  @Permissions('user.manage')
  async revoke(@Param('userId') userId: string, @Param('sessionId') sessionId: string) {
    // L-7 FIX: verify the session actually belongs to the path user
    const { PrismaService } = await import('../../shared/prisma/prisma.service');
    return this.revokeForUser(userId, sessionId, PrismaService);
  }

  private async revokeForUser(userId: string, sessionId: string, _Prisma: unknown): Promise<{ revoked: boolean }> {

    const owned = await this.sessions.listSessions(userId);
    if (!owned.some((s) => s.id === sessionId)) {
      const { AppError } = await import('../../common/errors/app-error');
      throw AppError.notFound();
    }
    await this.sessions.revokeSession(undefined, sessionId);
    return { revoked: true };
  }
}
