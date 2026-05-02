/**
 * CRM SaaS Backend - Application Bootstrap
 *
 * The OTel SDK (traces + metrics + logs) is initialised by otel.js via
 * `node -r ./otel.js` BEFORE this module is evaluated. Import tracing helpers
 * directly in the module that needs them (injectTraceContext, getActiveTraceIds,
 * recordError) — there is nothing to initialise here.
 */

import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseTransformInterceptor } from './common/interceptors/response-transform.interceptor';
import { ZodValidationPipe } from './common/pipes/zod-validation.pipe';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true,   // required for Stripe webhook signature verification
  });

  // ── Logger ────────────────────────────────────────────────────────────────
  const logger = app.get(WINSTON_MODULE_NEST_PROVIDER);
  app.useLogger(logger);

  // ── Cookies ───────────────────────────────────────────────────────────────
  app.use(cookieParser());

  // ── Security ──────────────────────────────────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: process.env.NODE_ENV === 'production',
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(compression());

  // ── CORS ──────────────────────────────────────────────────────────────────
  app.enableCors({
    origin:
      process.env.CORS_ORIGINS?.split(',') ?? ['http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-ID',
      'X-Tenant-ID',
      'X-Requested-With',
      'X-CSRF-Token',
      'Idempotency-Key',
    ],
  });

  // ── API Prefix ────────────────────────────────────────────────────────────
  const apiVersion = process.env.API_VERSION ?? 'v1';
  app.setGlobalPrefix(`api/${apiVersion}`);

  // ── Global Pipes / Filters / Interceptors ─────────────────────────────────
  app.useGlobalPipes(new ZodValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter(logger));
  app.useGlobalInterceptors(new ResponseTransformInterceptor());

  // ── WebSocket ─────────────────────────────────────────────────────────────
  app.useWebSocketAdapter(new IoAdapter(app));

  // ── Swagger (FIXED) ───────────────────────────────────────────────────────
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const config = new DocumentBuilder()
      .setTitle('CRM SaaS API')
      .setDescription('Production-grade CRM platform API documentation')
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'JWT',
      )
      .addTag('auth')
      .addTag('leads')
      .addTag('contacts')
      .addTag('companies')
      .addTag('deals')
      .addTag('activities')
      .addTag('tasks')
      .addTag('tickets')
      .addTag('communications')
      .addTag('automation')
      .addTag('analytics')
      .build();

    const document = SwaggerModule.createDocument(app, config);

    // ✅ FIX: no double prefix
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
      },
    });
  }

  // ── Start Server ──────────────────────────────────────────────────────────
  const port = parseInt(process.env.PORT ?? '3001', 10);
  await app.listen(port, '0.0.0.0');

  logger.log(
    `🚀 CRM Backend running on http://localhost:${port}/api/${apiVersion}`,
    'Bootstrap',
  );

  if (process.env.NODE_ENV !== 'production') {
    logger.log(
      `📚 Swagger: http://localhost:${port}/api/${apiVersion}/docs`,
      'Bootstrap',
    );
  }
}

bootstrap().catch((err) => {
  console.error('Fatal error during bootstrap:', err);
  process.exit(1);
});