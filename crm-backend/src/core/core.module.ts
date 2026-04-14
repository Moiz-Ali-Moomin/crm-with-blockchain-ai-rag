/**
 * Core Module - @Global()
 *
 * Exports infrastructure singletons available to ALL modules:
 * - PrismaService (DB client with tenant middleware)
 * - RedisService (ioredis wrapper)
 * - WsService (WebSocket emitter)
 * - LoggerService
 *
 * Being @Global() means modules don't need to import CoreModule explicitly.
 */

import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
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

// 🔥 THIS decides if Mongo is enabled
const isMongoEnabled = !!process.env.MONGO_URI;

@Global()
@Module({
  imports: [
    QueueModule,

    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),

    // ✅ ONLY load Mongo if URI exists
    ...(isMongoEnabled ? [MongoModule] : []),

    // ✅ ONLY register schemas if Mongo is enabled
    ...(isMongoEnabled
      ? [
          MongooseModule.forFeature([
            { name: EventLog.name, schema: EventLogSchema },
          ]),
        ]
      : []),
  ],

  providers: [
    PrismaService,
    PrismaTransactionService,
    RedisService,
    WsGateway,
    WsService,
    AuditLogInterceptor,

    // ⚠️ Optional: only provide repo if Mongo enabled
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

    ...(isMongoEnabled ? [EventLogRepository] : []),
  ],
})
export class CoreModule {}