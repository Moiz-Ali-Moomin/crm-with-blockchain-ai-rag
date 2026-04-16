/**
 * Root Application Module
 *
 * Architecture decisions:
 * - CoreModule is @Global() — provides Prisma, Redis, Logger everywhere
 * - ThrottlerModule uses Redis storage for distributed rate limiting
 * - Each feature module is self-contained (owns its controller/service/repo)
 */

import { Module, MiddlewareConsumer, NestModule, RequestMethod } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nestjs/throttler-storage-redis';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { ConfigModule } from '@nestjs/config';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';

import { validateEnv } from './config/env.validation';
import { CoreModule } from './core/core.module';

// Feature modules
import { TenantModule } from './modules/tenant/tenant.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { LeadsModule } from './modules/leads/leads.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { DealsModule } from './modules/deals/deals.module';
import { PipelinesModule } from './modules/pipelines/pipelines.module';
import { ActivitiesModule } from './modules/activities/activities.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { CommunicationsModule } from './modules/communications/communications.module';
import { EmailTemplatesModule } from './modules/email-templates/email-templates.module';
import { TicketsModule } from './modules/tickets/tickets.module';
import { AutomationModule } from './modules/automation/automation.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { BillingModule } from './modules/billing/billing.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AiModule } from './modules/ai/ai.module';
import { BlockchainModule } from './modules/blockchain/blockchain.module';
import { WalletsModule } from './modules/wallets/wallets.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { JobsModule } from './jobs/jobs.module';
import { HealthModule } from './health/health.module';

// Middleware
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { TenantContextMiddleware } from './common/middleware/tenant-context.middleware';
import { IdempotencyMiddleware } from './common/middleware/idempotency.middleware';
import { TenantThrottlerGuard } from './common/guards/tenant-throttler.guard';

@Module({
  imports: [
    // ── Configuration ────────────────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
      validate: validateEnv,
      cache: true,
    }),

    // ── Logger ───────────────────────────────────────────────────────────────
    WinstonModule.forRoot({
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.timestamp(),
            process.env.NODE_ENV !== 'production'
              ? winston.format.colorize()
              : winston.format.uncolorize(),
            winston.format.printf(({ timestamp, level, message, context, requestId, tenantId, ...meta }) => {
              const ctx = context ? `[${context}]` : '';
              const rid = requestId ? ` rid=${requestId}` : '';
              const tid = tenantId ? ` tenant=${tenantId}` : '';
              const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
              return `${timestamp} ${level} ${ctx}${rid}${tid} ${message}${metaStr}`;
            }),
          ),
        }),
        // Production: structured JSON to files with size-based rotation
        // Files are kept for 14 days; max 500 MB per file; max 5 GB total
        ...(process.env.NODE_ENV === 'production'
          ? [
              new winston.transports.File({
                filename: 'logs/error.log',
                level: 'error',
                format: winston.format.combine(
                  winston.format.timestamp(),
                  winston.format.json(),
                ),
                maxsize: 50 * 1024 * 1024,  // 50 MB per file
                maxFiles: 10,               // keep 10 rotated error logs
                tailable: true,
              }),
              new winston.transports.File({
                filename: 'logs/combined.log',
                format: winston.format.combine(
                  winston.format.timestamp(),
                  winston.format.json(),
                ),
                maxsize: 100 * 1024 * 1024, // 100 MB per file
                maxFiles: 14,               // keep 14 rotated combined logs
                tailable: true,
              }),
            ]
          : []),
      ],
    }),

    // ── Rate Limiting (Redis-backed for distributed deployments) ─────────────
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          { name: 'short',  ttl: 1_000,     limit: 20    },
          { name: 'medium', ttl: 60_000,    limit: 200   },
          { name: 'long',   ttl: 3_600_000, limit: 1_000 },
        ],
        storage: new ThrottlerStorageRedisService(
          new Redis(config.get<string>('REDIS_URL', 'redis://localhost:6379'), {
            lazyConnect: false,
            maxRetriesPerRequest: 3,
            retryStrategy: (times) => (times > 10 ? null : Math.min(times * 100, 3_000)),
          }),
        ),
      }),
    }),

    // ── Core Infrastructure ──────────────────────────────────────────────────
    CoreModule,

    // ── Feature Modules ──────────────────────────────────────────────────────
    TenantModule,
    AuthModule,
    UsersModule,
    RbacModule,
    LeadsModule,
    ContactsModule,
    CompaniesModule,
    DealsModule,
    PipelinesModule,
    ActivitiesModule,
    TasksModule,
    CommunicationsModule,
    EmailTemplatesModule,
    TicketsModule,
    AutomationModule,
    NotificationsModule,
    WebhooksModule,
    IntegrationsModule,
    BillingModule,
    AnalyticsModule,
    AiModule,
    BlockchainModule,

    // ── Financial Rail ───────────────────────────────────────────────────────
    WalletsModule,
    PaymentsModule,
    LedgerModule,

    // ── Background Jobs ──────────────────────────────────────────────────────
    JobsModule,

    // ── Health Checks ────────────────────────────────────────────────────────
    HealthModule,
  ],
  providers: [
    // Apply JwtAuthGuard globally — all routes protected unless @Public() is set
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Tenant-aware throttler (sliding window per tier) replaces plain ThrottlerGuard
    { provide: APP_GUARD, useClass: TenantThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Inject X-Request-ID on every request for distributed tracing
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });

    // Extract tenantId from JWT, store in AsyncLocalStorage
    // Applied AFTER auth routes to avoid circular dependency
    consumer
      .apply(TenantContextMiddleware)
      .exclude(
        { path: 'api/v1/auth/(.*)', method: RequestMethod.ALL },
        { path: 'api/v1/health/(.*)', method: RequestMethod.GET },
        { path: 'api/v1/health', method: RequestMethod.GET },
      )
      .forRoutes({ path: '*', method: RequestMethod.ALL });

    // Idempotency enforcement on financial + deal mutation routes
    consumer
      .apply(IdempotencyMiddleware)
      .forRoutes(
        { path: 'api/v1/payments*', method: RequestMethod.POST },
        { path: 'api/v1/deals*',    method: RequestMethod.POST },
        { path: 'api/v1/deals*',    method: RequestMethod.PATCH },
      );
  }
}
