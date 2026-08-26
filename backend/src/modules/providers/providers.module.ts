import { Global, Logger, Module } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { HttpService } from './http.service';
import { SMS_PROVIDER, type SmsProvider } from './sms/sms-provider.port';
import { ConsoleSmsProvider } from './sms/console-sms.provider';
import { KavenegarProvider } from './sms/kavenegar.provider';
import { EMAIL_PROVIDER, type EmailProvider } from './email/email-provider.port';
import { ConsoleEmailProvider } from './email/console-email.provider';
import { NoopEmailProvider } from './email/noop-email.provider';

/**
 * Outbound provider wiring. Selecting a provider is a boot-time decision so a
 * misconfiguration fails at startup instead of at the first user request.
 */
@Global()
@Module({
  providers: [
    HttpService,
    {
      provide: SMS_PROVIDER,
      inject: [AppConfigService, HttpService],
      useFactory: (config: AppConfigService, http: HttpService): SmsProvider => {
        const logger = new Logger('Providers');
        const chosen = config.smsProvider.toLowerCase();

        if (chosen === 'kavenegar') {
          if (!config.kavenegar.apiKey) {
            throw new Error('SMS_PROVIDER=kavenegar requires KAVENEGAR_API_KEY');
          }
          logger.log('SMS provider: kavenegar');
          return new KavenegarProvider(config, http);
        }

        // Guard against shipping the code-logging provider to production.
        if (config.isProduction) {
          throw new Error(
            'SMS_PROVIDER=console is not permitted in production — set SMS_PROVIDER=kavenegar',
          );
        }
        logger.warn('SMS provider: console (development only — codes are printed to the log)');
        return new ConsoleSmsProvider();
      },
    },
    {
      provide: EMAIL_PROVIDER,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): EmailProvider => {
        const logger = new Logger('Providers');
        const chosen = config.emailProvider.toLowerCase();
        if (chosen === 'smtp') {
          // SMTP is not implemented yet; refusing is safer than silently
          // dropping recovery mail on the floor.
          throw new Error('EMAIL_PROVIDER=smtp is not implemented yet — use console in development');
        }
        // Explicit "no email" — the only production-legal value until SMTP
        // exists. Callers already treat `delivered: false` as a soft failure.
        if (chosen === 'noop' || chosen === 'none') {
          logger.warn('Email provider: noop (transactional email is NOT delivered)');
          return new NoopEmailProvider();
        }
        if (config.isProduction) {
          throw new Error(
            'EMAIL_PROVIDER=console is not permitted in production — set EMAIL_PROVIDER=noop ' +
              '(no email) until an SMTP provider is implemented',
          );
        }
        logger.warn('Email provider: console (development only — messages are printed to the log)');
        return new ConsoleEmailProvider();
      },
    },
  ],
  exports: [HttpService, SMS_PROVIDER, EMAIL_PROVIDER],
})
export class ProvidersModule {}
