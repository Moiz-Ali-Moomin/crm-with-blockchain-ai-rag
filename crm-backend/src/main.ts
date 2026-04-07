/**
 * CRM SaaS Backend - Application Bootstrap
 *
 * Key decisions:
 * - Helmet for security headers
 * - Global validation pipe with Zod
 * - Socket.io for realtime (cors-configured)
 * - Swagger only in non-production
 * - Global response transform + exception filters
 */

import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseTransformInterceptor } from './common/interceptors/response-transform.interceptor';
import { ZodValidationPipe } from './common/pipes/zod-validation.pipe';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Disable default logger; NestJS will use Winston via WINSTON_MODULE_NEST_PROVIDER
    bufferLogs: true,
  });

  // ── Winston Logger ──────────────────────────────────────────────────────────
  const logger = app.get(WINSTON_MODULE_NEST_PROVIDER);
  app.useLogger(logger);

  // ── Security ────────────────────────────────────────────────────────────────
  app.use(helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production',
    crossOriginEmbedderPolicy: false, // Required for some browser integrations
  }));
  app.use(compression());

  // ── CORS ────────────────────────────────────────────────────────────────────
  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',') ?? ['http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Tenant-ID'],
  });

  // ── Global API Prefix ───────────────────────────────────────────────────────
  const apiVersion = process.env.API_VERSION ?? 'v1';
  app.setGlobalPrefix(`api/${apiVersion}`);

  // ── Global Pipes, Filters, Interceptors ────────────────────────────────────
  app.useGlobalPipes(new ZodValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter(logger));
  app.useGlobalInterceptors(new ResponseTransformInterceptor());

  // ── WebSocket Adapter ───────────────────────────────────────────────────────
  app.useWebSocketAdapter(new IoAdapter(app));

  // ── Swagger (Dev/Staging only) ──────────────────────────────────────────────
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('CRM SaaS API')
      .setDescription('Production-grade CRM platform API documentation')
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'JWT',
      )
      .addTag('auth', 'Authentication & authorization')
      .addTag('leads', 'Lead management')
      .addTag('contacts', 'Contact management')
      .addTag('companies', 'Company management')
      .addTag('deals', 'Deal & pipeline management')
      .addTag('activities', 'Activity logging')
      .addTag('tasks', 'Task management')
      .addTag('tickets', 'Support ticketing')
      .addTag('communications', 'Email/SMS/WhatsApp')
      .addTag('automation', 'Workflow automation')
      .addTag('analytics', 'Reports & analytics')
      .build();

    const document = SwaggerModule.createDocument(app, config);

    SwaggerModule.setup(`api/${apiVersion}/docs`, app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
      },
    });}

    const port = parseInt(process.env.PORT ?? '4000', 10);
    await app.listen(port);

    logger.log(`🚀 CRM Backend running on http://localhost:${port}/api/${apiVersion}`, 'Bootstrap');
    logger.log(`📚 Swagger: http://localhost:${port}/api/docs`, 'Bootstrap');
  }

  bootstrap().catch((err) => {
    console.error('Fatal error during bootstrap:', err);
    process.exit(1);
  });
