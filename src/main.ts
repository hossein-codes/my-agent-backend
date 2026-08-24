import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { AppConfigService } from './config/app-config.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });

  const config = app.get(AppConfigService);
  Logger.overrideLogger(config.isProduction ? ['log', 'warn', 'error'] : ['verbose', 'log', 'warn', 'error']);

  configureApp(app, config);

  const port = config.port;
  // 0.0.0.0 — required for Docker/reverse-proxy deployments (spec §47).
  await app.listen(port, '0.0.0.0');

  new Logger('Bootstrap').log(
    `Fashion backend listening on :${port} (${config.nodeEnv}) — ` +
      `${config.swaggerEnabled ? 'docs at /docs' : 'swagger disabled'}`,
  );
}

void bootstrap();
