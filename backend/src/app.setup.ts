import { Logger, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { join } from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import { AppConfigService } from './config/app-config.service';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

/**
 * All cross-cutting HTTP wiring lives here, applied in a deliberate order:
 *
 *   1. trust proxy     — must precede anything reading `req.ip`
 *   2. request id      — must precede logging so entries can be correlated
 *   3. helmet, cors, cookies
 *   4. global prefix + version
 *   5. validation, error filter, logging
 *   6. swagger, static files
 *
 * `main.ts` stays a thin bootstrap so the same configuration is reachable from
 * tests without starting a listener.
 */
export function configureApp(app: NestExpressApplication, config: AppConfigService): void {
  const logger = new Logger('Setup');

  // --- 1. proxy trust --------------------------------------------------------
  // Behind a reverse proxy, `req.ip` must come from x-forwarded-for; otherwise
  // every client appears to be the proxy and IP-scoped rate limits collapse
  // onto a single bucket. Off by default so it cannot be spoofed when bare.
  app.set('trust proxy', config.isProduction ? 1 : false);
  app.disable('x-powered-by');

  // --- 2. request id (before logging) ----------------------------------------
  const requestId = new RequestIdMiddleware();
  app.use((req: Request, res: Response, next: NextFunction) => requestId.use(req, res, next));

  // --- 3. security headers, CORS, cookies ------------------------------------
  app.use(
    helmet({
      // The API is consumed by a separate SPA origin; CSP belongs there.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  const origins = config.corsOrigins;
  app.enableCors({
    // Exact-origin allowlist. `credentials: true` forbids `*`, so an explicit
    // list is mandatory — a wildcard here would silently break cookie auth.
    origin: (origin, callback) => {
      // Same-origin/curl/native apps send no Origin header — allow those.
      if (!origin) return callback(null, true);
      if (origins.includes(origin)) return callback(null, true);
      logger.warn(`CORS rejected origin: ${origin}`);
      return callback(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'Retry-After'],
    maxAge: 600,
  });

  app.use(cookieParser());

  // --- 4. routing ------------------------------------------------------------
  // The prefix carries the API version (`api/v1`). There is exactly one live
  // version; a second one would be added as a separate prefix, not by Nest
  // URI versioning, so the two mechanisms never fight over the path.
  app.setGlobalPrefix(config.apiPrefix, {
    // Health probes are hit by Docker/k8s and must stay at a stable URL.
    exclude: ['health/live', 'health/ready'],
  });
  app.enableShutdownHooks();

  // --- 5. validation, errors, logging ----------------------------------------
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip unknown properties
      // forbidNonWhitelisted stays OFF: a 400 on an extra field is a poor DX
      // for a frontend that is still stabilizing its payloads.
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      // Consistent 400 body: the filter turns the message array into `details.errors`.
      stopAtFirstError: false,
      validateCustomDecorators: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  // --- 6. docs & static ------------------------------------------------------
  if (config.swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Fashion & Accessories API')
      .setDescription('Single-vendor e-commerce backend. All money values are Integer Toman.')
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
      .addCookieAuth('refresh_token')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document, {
      jsonDocumentUrl: `${config.apiPrefix}/docs-json`,
      swaggerOptions: { persistAuthorization: true },
    });
    logger.log(`Swagger UI at /docs, OpenAPI JSON at /${config.apiPrefix}/docs-json`);
  } else {
    logger.warn('Swagger disabled (SWAGGER_ENABLED=false)');
  }

  if (config.storageProvider === 'local') {
    app.useStaticAssets(join(process.cwd(), config.localStorageDir.replace(/^\.\//, '')), {
      prefix: '/static/',
      maxAge: '7d',
      index: false,
    });
  }
}
