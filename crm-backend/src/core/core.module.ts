/**
 * Core Module - @Global()
 *
 * Exports infrastructure singletons available to ALL modules:
 * - PrismaService (DB client with tenant middleware)
 * - RedisService (ioredis wrapper)
 * - WsService (WebSocket emitter)
 * - CircuitBreakerService (external provider protection)
 * - DomainEventBus (in-process + async event fanout)
 * - SagaStateStore (distributed saga state)
 * - BusinessMetricsService (Prometheus metrics)
 * - SlidingWindowRateLimiter (per-tenant sliding window)
 *
 * Being @Global() means modules don't need to import CoreModule explicitly.
 */

import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';

import { PrismaService } from './database/prisma.service';
import { PrismaTransactionService } from './database/prisma-transaction.service';
import { RedisService } from './cache/redis.service';
import { QueueModule } from './queue/queue.module';
import { WsGateway } from './websocket/ws.gateway';
import { WsService } from './websocket/ws.service';
import { AuditLogInterceptor } from '../common/interceptors/audit-log.interceptor';
import { MongoModule } from './database/mongo.module';
import { EventLog, EventLogSchema } from './database/schemas/event-log.schema';
import { EventLogRepository } from './database/repositories/event-log.repository';

// ── New infrastructure services ──────────────────────────────────────────────
import { CircuitBreakerService } from './resilience/circuit-breaker.service';
import { DomainEventBus } from './events/domain-event-bus.service';
import { SagaStateStore } from './saga/saga-state-store.service';
import { BusinessMetricsService } from './metrics/business-metrics.service';
import { MetricsController } from './metrics/metrics.controller';
import { SlidingWindowRateLimiter } from '../common/rate-limit/sliding-window.service';
import { IdempotencyMiddleware } from '../common/middleware/idempotency.middleware';

const isMongoEnabled = !!process.env.MONGO_URI;

@Global()
@Module({
  imports: [
    QueueModule,

    // EventEmitter2 — required by DomainEventBus (@OnEvent listeners in Sagas)
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      newListener: false,
      removeListener: false,
      maxListeners: 20,
      verboseMemoryLeak: false,
      ignoreErrors: false,
    }),

    // @Cron decorator support — required by DlqProcessorService
    ScheduleModule.forRoot(),

    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),

    ...(isMongoEnabled ? [MongoModule] : []),
    ...(isMongoEnabled
      ? [MongooseModule.forFeature([{ name: EventLog.name, schema: EventLogSchema }])]
      : []),
  ],

  controllers: [
    MetricsController,
  ],

  providers: [
    PrismaService,
    PrismaTransactionService,
    RedisService,
    WsGateway,
    WsService,

    // ── New infrastructure ────────────────────────────────────────────────
    CircuitBreakerService,
    DomainEventBus,
    SagaStateStore,
    BusinessMetricsService,
    SlidingWindowRateLimiter,
    IdempotencyMiddleware,

    // AuditLogInterceptor now depends on BusinessMetricsService
    AuditLogInterceptor,

    ...(isMongoEnabled ? [EventLogRepository] : []),
  ],

  exports: [
    PrismaService,
    PrismaTransactionService,
    RedisService,
    QueueModule,
    WsGateway,
    WsService,
    AuditLogInterceptor,

    // ── New infrastructure (globally available) ────────────────────────────
    CircuitBreakerService,
    DomainEventBus,
    SagaStateStore,
    BusinessMetricsService,
    SlidingWindowRateLimiter,
    IdempotencyMiddleware,

    ...(isMongoEnabled ? [EventLogRepository] : []),
  ],
})
export class CoreModule {}
