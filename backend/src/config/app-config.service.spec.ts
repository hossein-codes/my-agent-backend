import { ConfigService } from '@nestjs/config';
import { AppConfigService } from './app-config.service';

/**
 * The cookie/CORS/secret invariants are what decide whether a deployment can
 * log anybody in, so they are pinned here rather than discovered in production.
 */
function config(env: Record<string, string> = {}): AppConfigService {
  const fake = { get: (key: string) => env[key] } as unknown as ConfigService;
  return new AppConfigService(fake);
}

describe('AppConfigService — refresh cookie', () => {
  it('defaults to lax (no FRONTEND_BASE_URL means a same-site deployment)', () => {
    expect(config().authCookieSameSite).toBe('lax');
  });

  it('keeps lax for the standard local split (localhost:3001 + localhost:3000)', () => {
    // Same site: SameSite ignores the port. Picking `none` here would break
    // local login, because AUTH_COOKIE_SECURE resolves to false outside prod
    // and browsers reject `SameSite=None` without `Secure`.
    const c = config({
      PUBLIC_BASE_URL: 'http://localhost:3000',
      FRONTEND_BASE_URL: 'http://localhost:3001',
    });
    expect(c.authCookieSameSite).toBe('lax');
  });

  it('picks none when the frontend is on another host (Vercel app + hosted API)', () => {
    const c = config({
      NODE_ENV: 'production',
      PUBLIC_BASE_URL: 'https://api.example.com',
      FRONTEND_BASE_URL: 'https://shop.vercel.app',
    });
    expect(c.authCookieSameSite).toBe('none');
  });

  it('treats a same-site subdomain split as cross-site (stricter, still correct)', () => {
    const c = config({
      PUBLIC_BASE_URL: 'https://api.example.com',
      FRONTEND_BASE_URL: 'https://www.example.com',
    });
    expect(c.authCookieSameSite).toBe('none');
  });

  it('honours an explicit override in both directions', () => {
    const split = {
      PUBLIC_BASE_URL: 'https://api.example.com',
      FRONTEND_BASE_URL: 'https://shop.vercel.app',
    };
    expect(config({ ...split, AUTH_COOKIE_SAME_SITE: 'lax' }).authCookieSameSite).toBe('lax');
    expect(config({ AUTH_COOKIE_SAME_SITE: 'none' }).authCookieSameSite).toBe('none');
    expect(config({ AUTH_COOKIE_SAME_SITE: 'STRICT' }).authCookieSameSite).toBe('strict');
  });

  it('ignores an unknown value and falls back to auto', () => {
    expect(config({ AUTH_COOKIE_SAME_SITE: 'sometimes' }).authCookieSameSite).toBe('lax');
  });

  it('resolves AUTH_COOKIE_SECURE=auto to false in dev and true in production', () => {
    expect(config().authCookieSecure).toBe(false);
    expect(config({ NODE_ENV: 'production' }).authCookieSecure).toBe(true);
    expect(config({ NODE_ENV: 'production', AUTH_COOKIE_SECURE: 'false' }).authCookieSecure).toBe(
      false,
    );
  });
});

describe('AppConfigService — production boot invariants', () => {
  const prod = (env: Record<string, string> = {}) =>
    config({ NODE_ENV: 'production', ...env });

  it('rejects REDIS_URL=memory in production', () => {
    expect(() => prod({ REDIS_URL: 'memory' }).redisUrl).toThrow(
      /REDIS_URL=memory is not allowed in production/,
    );
    expect(config({ REDIS_URL: 'memory' }).redisUrl).toBe('memory');
  });

  it('requires DATABASE_URL', () => {
    expect(() => config().databaseUrl).toThrow(/Missing required environment variable: DATABASE_URL/);
  });

  it('rejects change-me / short secrets in production only', () => {
    expect(() => prod({ JWT_ACCESS_SECRET: 'change-me-access-secret-32-chars-min' }).jwtAccessSecret)
      .toThrow(/JWT_ACCESS_SECRET must be set to at least 32 characters in production/);
    expect(() => prod({ OTP_HASH_PEPPER: 'too-short' }).otpHashPepper).toThrow(/OTP_HASH_PEPPER/);
    const real = 'a'.repeat(64);
    expect(prod({ DATA_ENCRYPTION_KEY: real }).dataEncryptionKey).toBe(real);
    // Same value is tolerated (with a warning) outside production.
    expect(config({ OTP_HASH_PEPPER: 'short' }).otpHashPepper).toBeTruthy();
  });

  it('never uses OTP_FIXED_CODE in production', () => {
    expect(prod({ OTP_FIXED_CODE: '123456' }).otp.fixedCode).toBeUndefined();
    expect(config({ OTP_FIXED_CODE: '123456' }).otp.fixedCode).toBe('123456');
  });

  it('defaults Swagger off in production and on elsewhere', () => {
    expect(prod().swaggerEnabled).toBe(false);
    expect(config().swaggerEnabled).toBe(true);
  });

  it('exposes CORS origins as an exact list', () => {
    expect(
      config({ CORS_ORIGINS: 'https://a.vercel.app, https://b.vercel.app' }).corsOrigins,
    ).toEqual(['https://a.vercel.app', 'https://b.vercel.app']);
  });
});
