import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AppConfigService } from '../../config/app-config.service';
import { EMAIL_PROVIDER, type EmailProvider } from './email/email-provider.port';
import { SMS_PROVIDER, type SmsProvider } from './sms/sms-provider.port';
import { ProvidersModule } from './providers.module';

/**
 * Provider selection happens at boot, so a bad value takes the whole API down
 * before it serves a single request. These cases are exactly the ones that
 * decide whether a production deploy can start at all — hence they are asserted
 * through the real Nest container rather than by calling the factory directly.
 */
function configFor(env: Record<string, string>): AppConfigService {
  const fake = { get: (key: string) => env[key] } as unknown as ConfigService;
  return new AppConfigService(fake);
}

@Global()
@Module({ providers: [AppConfigService], exports: [AppConfigService] })
class ConfigModuleStub {}

async function boot(env: Record<string, string>) {
  return Test.createTestingModule({ imports: [ConfigModuleStub, ProvidersModule] })
    .overrideProvider(AppConfigService)
    .useValue(configFor(env))
    .compile();
}

const prod = (extra: Record<string, string> = {}) => ({ NODE_ENV: 'production', ...extra });
// A production boot also needs a valid SMS provider, otherwise the SMS factory
// throws first and the email case under test is never reached.
const prodWithSms = (extra: Record<string, string> = {}) =>
  prod({ SMS_PROVIDER: 'kavenegar', KAVENEGAR_API_KEY: 'k', ...extra });

describe('SMS provider selection (boot-time)', () => {
  it('refuses the code-logging provider in production', async () => {
    // EMAIL_PROVIDER is pinned to a valid value: providers resolve in parallel,
    // so otherwise the email guard can win the race and mask the SMS one.
    await expect(boot(prod({ SMS_PROVIDER: 'console', EMAIL_PROVIDER: 'noop' }))).rejects.toThrow(
      /SMS_PROVIDER=console is not permitted in production/,
    );
  });

  it('refuses kavenegar without an API key', async () => {
    await expect(boot(prod({ SMS_PROVIDER: 'kavenegar', EMAIL_PROVIDER: 'noop' }))).rejects.toThrow(
      /SMS_PROVIDER=kavenegar requires KAVENEGAR_API_KEY/,
    );
  });

  it('accepts kavenegar with a key in production', async () => {
    const m = await boot(
      prod({ SMS_PROVIDER: 'kavenegar', KAVENEGAR_API_KEY: 'k', EMAIL_PROVIDER: 'noop' }),
    );
    expect(m.get<SmsProvider>(SMS_PROVIDER).name).toBe('kavenegar');
    await m.close();
  });

  it('still allows the console provider in development', async () => {
    const m = await boot({ SMS_PROVIDER: 'console' });
    expect(m.get<SmsProvider>(SMS_PROVIDER).name).toBe('console');
    await m.close();
  });
});

describe('Email provider selection (boot-time)', () => {
  it('refuses console in production (it would leak recovery mail into logs)', async () => {
    await expect(boot(prodWithSms({ EMAIL_PROVIDER: 'console' }))).rejects.toThrow(
      /EMAIL_PROVIDER=console is not permitted in production/,
    );
  });

  it('refuses smtp until it is actually implemented', async () => {
    await expect(boot({ EMAIL_PROVIDER: 'smtp' })).rejects.toThrow(
      /EMAIL_PROVIDER=smtp is not implemented yet/,
    );
  });

  it('boots in production with EMAIL_PROVIDER=noop — the production-legal value', async () => {
    const m = await boot(prodWithSms({ EMAIL_PROVIDER: 'noop' }));
    expect(m.get<EmailProvider>(EMAIL_PROVIDER).name).toBe('noop');
    await m.close();
  });

  it('reports noop delivery as a soft failure, not a thrown error', async () => {
    const m = await boot(prodWithSms({ EMAIL_PROVIDER: 'noop' }));
    const result = await m.get<EmailProvider>(EMAIL_PROVIDER).send({
      to: 'a@b.c',
      subject: 's',
      text: 't',
    });
    expect(result.delivered).toBe(false);
    expect(result.error).toBeTruthy();
    await m.close();
  });

  it('still allows the console provider in development', async () => {
    const m = await boot({ EMAIL_PROVIDER: 'console' });
    expect(m.get<EmailProvider>(EMAIL_PROVIDER).name).toBe('console');
    await m.close();
  });
});
