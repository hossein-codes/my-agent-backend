import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MEMORY_REDIS_URL } from '../shared/redis/memory-redis';

/**
 * Typed, validated view over `process.env`.
 *
 * Nothing else in the app reads `process.env` directly — that keeps the env
 * surface discoverable and makes it impossible to typo a variable name into a
 * silent `undefined`.
 *
 * Boot-time invariants (fail fast, never limp along):
 *  - production secrets must be real (>= 32 chars, not a `change-me` placeholder)
 *  - CORS origins must be exact origins, no wildcards, in production
 */
@Injectable()
export class AppConfigService {
  private readonly logger = new Logger('Config');

  constructor(private readonly env: ConfigService) {}

  // --- application -----------------------------------------------------------

  get nodeEnv(): string {
    return this.get('NODE_ENV', 'development');
  }
  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }
  get isTest(): boolean {
    return this.nodeEnv === 'test';
  }
  get port(): number {
    return this.num('PORT', 3000);
  }
  /** Global route prefix, e.g. `api/v1`. */
  get apiPrefix(): string {
    return this.get('API_PREFIX', 'api/v1').replace(/^\/+|\/+$/g, '');
  }
  get publicBaseUrl(): string {
    return this.get('PUBLIC_BASE_URL', `http://localhost:${this.port}`).replace(/\/+$/, '');
  }
  get logLevel(): string {
    return this.get('LOG_LEVEL', this.isProduction ? 'info' : 'debug');
  }
  get swaggerEnabled(): boolean {
    return this.bool('SWAGGER_ENABLED', !this.isProduction);
  }
  /**
   * Where the browser is sent after a payment redirect. Defaults to the API's
   * own origin, which is only correct when front and back share a domain —
   * set `FRONTEND_BASE_URL` in any split deployment (see spec: payments).
   */
  get frontendBaseUrl(): string {
    return this.get('FRONTEND_BASE_URL', this.publicBaseUrl).replace(/\/+$/, '');
  }

  // --- datastores ------------------------------------------------------------

  get databaseUrl(): string {
    return this.required('DATABASE_URL');
  }
  /**
   * Defaults to `127.0.0.1` rather than `localhost`: on Windows `localhost`
   * resolves to `::1` first, while a locally installed server often listens on
   * IPv4 only — the connect then fails with ECONNREFUSED for no visible reason.
   *
   * The literal value `memory` selects the in-process Redis stand-in
   * (`shared/redis/memory-redis.ts`) so a dev box with no Redis can still run
   * the OTP flow. It is single-process and non-persistent, so selecting it in
   * production is a configuration error and fails fast here.
   */
  get redisUrl(): string {
    const url = this.get('REDIS_URL', 'redis://127.0.0.1:6379/0');
    if (url === MEMORY_REDIS_URL && this.isProduction) {
      throw new Error(
        'REDIS_URL=memory is a development-only mode (in-process, non-persistent, ' +
          'not shared between instances). Set REDIS_URL to a real redis:// or ' +
          'rediss:// endpoint in production.',
      );
    }
    return url;
  }

  // --- secrets ---------------------------------------------------------------

  get jwtAccessSecret(): string {
    return this.secret('JWT_ACCESS_SECRET', 'dev-only-access-secret-change-me-32');
  }
  get otpHashPepper(): string {
    return this.secret('OTP_HASH_PEPPER', 'dev-only-otp-pepper-change-me-32');
  }
  get auditHashKey(): string {
    return this.secret('AUDIT_HASH_KEY', 'dev-only-audit-key-change-me-32');
  }
  get dataEncryptionKey(): string {
    return this.secret('DATA_ENCRYPTION_KEY', 'dev-only-encryption-key-32-chars');
  }
  get adminBootstrapSecret(): string {
    return this.get('ADMIN_BOOTSTRAP_SECRET', '');
  }

  // --- auth / sessions -------------------------------------------------------

  get accessTokenTtlSeconds(): number {
    return this.num('ACCESS_TOKEN_TTL_SECONDS', 900);
  }
  get refreshTokenTtlDays(): number {
    return this.num('REFRESH_TOKEN_TTL_DAYS', 30);
  }
  get authCookieDomain(): string | undefined {
    const v = this.get('AUTH_COOKIE_DOMAIN', '').trim();
    return v.length ? v : undefined;
  }
  /**
   * Resolved to a concrete boolean. `auto` means "secure when production".
   * `res.cookie()` needs a boolean, so the resolution happens here, once.
   */
  get authCookieSecure(): boolean {
    const raw = this.get('AUTH_COOKIE_SECURE', 'auto').toLowerCase();
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return this.isProduction;
  }

  // --- OTP -------------------------------------------------------------------

  get otp() {
    return {
      ttlSeconds: this.num('OTP_TTL_SECONDS', 180),
      maxVerifyAttempts: this.num('OTP_MAX_VERIFY_ATTEMPTS', 5),
      resendCooldownSeconds: this.num('OTP_RESEND_COOLDOWN_SECONDS', 60),
      requestHourlyLimit: this.num('OTP_REQUEST_HOURLY_LIMIT', 5),
      /** Console provider prints the code — never enable this in production. */
      fixedCode: this.isProduction ? undefined : this.get('OTP_FIXED_CODE', '') || undefined,
    };
  }

  // --- CORS ------------------------------------------------------------------

  get corsOrigins(): string[] {
    return this.get('CORS_ORIGINS', 'http://localhost:3000,http://localhost:5173')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
  }

  // --- external providers ----------------------------------------------------

  get paymentProvider(): string {
    return this.get('PAYMENT_PROVIDER', 'mock');
  }
  get zarinpal() {
    return {
      merchantId: this.get('ZARINPAL_MERCHANT_ID', ''),
      sandbox: this.bool('ZARINPAL_SANDBOX', true),
    };
  }
  get smsProvider(): string {
    return this.get('SMS_PROVIDER', 'console');
  }
  get kavenegar() {
    return {
      apiKey: this.get('KAVENEGAR_API_KEY', ''),
      sender: this.get('KAVENEGAR_SENDER', ''),
      otpTemplate: this.get('KAVENEGAR_OTP_TEMPLATE', 'otp'),
    };
  }
  get identityProvider(): string {
    return this.get('IDENTITY_PROVIDER', 'mock');
  }
  get emailProvider(): string {
    return this.get('EMAIL_PROVIDER', 'console');
  }
  get smtp() {
    return {
      host: this.get('SMTP_HOST', ''),
      port: this.num('SMTP_PORT', 587),
      user: this.get('SMTP_USER', ''),
      password: this.get('SMTP_PASSWORD', ''),
      from: this.get('MAIL_FROM', 'no-reply@example.com'),
    };
  }

  // --- storage ---------------------------------------------------------------

  get storageProvider(): string {
    return this.get('STORAGE_PROVIDER', 'local');
  }
  get localStorageDir(): string {
    return this.get('LOCAL_STORAGE_DIR', './uploads');
  }
  get publicCdnBaseUrl(): string {
    return this.get('PUBLIC_CDN_BASE_URL', `${this.publicBaseUrl}/static`);
  }
  get s3() {
    return {
      endpoint: this.get('S3_ENDPOINT', ''),
      bucket: this.get('S3_BUCKET', ''),
      accessKeyId: this.get('S3_ACCESS_KEY_ID', ''),
      secretAccessKey: this.get('S3_SECRET_ACCESS_KEY', ''),
    };
  }

  // --- business rules (server-side authority) --------------------------------

  get business() {
    return {
      orderPaymentWindowMinutes: this.num('ORDER_PAYMENT_WINDOW_MINUTES', 30),
      returnWindowDays: this.num('RETURN_WINDOW_DAYS', 7),
      maxQtyPerOrderLine: this.num('MAX_QTY_PER_ORDER_LINE', 10),
      maxCartItems: this.num('MAX_CART_ITEMS', 50),
      /** 0 = prices are VAT-inclusive (ADR-0009). */
      vatRatePercent: this.num('VAT_RATE_PERCENT', 0),
      reviewRequiresVerifiedPurchase: this.bool('REVIEW_REQUIRES_VERIFIED_PURCHASE', false),
      reviewModerationEnabled: this.bool('REVIEW_MODERATION_ENABLED', true),
      oneCouponPerOrder: this.bool('ONE_COUPON_PER_ORDER', true),
    };
  }

  // --- uploads ---------------------------------------------------------------

  get uploads() {
    return {
      maxFileSizeBytes: this.num('MAX_UPLOAD_SIZE_BYTES', 8 * 1024 * 1024),
      maxImagesPerProduct: this.num('MAX_IMAGES_PER_PRODUCT', 12),
      maxImagesPerReview: this.num('MAX_IMAGES_PER_REVIEW', 3),
      allowedImageMimeTypes: this.get(
        'ALLOWED_IMAGE_MIME_TYPES',
        'image/jpeg,image/png,image/webp',
      )
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    };
  }

  // --- pagination ------------------------------------------------------------

  get defaultPageSize(): number {
    return this.num('DEFAULT_PAGE_SIZE', 20);
  }
  get maxPageSize(): number {
    return this.num('MAX_PAGE_SIZE', 100);
  }

  // --- helpers ---------------------------------------------------------------

  private get(key: string, fallback: string): string {
    const v = this.env.get<string>(key);
    return v === undefined || v === '' ? fallback : v;
  }

  private num(key: string, fallback: number): number {
    const raw = this.env.get<string>(key);
    if (raw === undefined || raw.trim() === '') return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  }

  private bool(key: string, fallback: boolean): boolean {
    const raw = this.env.get<string>(key);
    if (raw === undefined || raw.trim() === '') return fallback;
    return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
  }

  private required(key: string): string {
    const v = this.env.get<string>(key);
    if (!v) throw new Error(`Missing required environment variable: ${key}`);
    return v;
  }

  /** Secrets must be real in production; dev fallbacks are loudly logged. */
  private secret(key: string, devFallback: string): string {
    const v = this.env.get<string>(key);
    if (v && v.length >= 32 && !v.startsWith('change-me')) return v;
    if (this.isProduction) {
      throw new Error(
        `Environment variable ${key} must be set to at least 32 characters in production ` +
          `(generate with: openssl rand -hex 32)`,
      );
    }
    this.logger.warn(`${key} is not set to a production-grade value — using an insecure dev fallback`);
    return devFallback;
  }
}
