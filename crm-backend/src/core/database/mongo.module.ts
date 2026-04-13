/**
 * MongoModule — Global secondary database connection
 *
 * Responsibilities:
 * - Establishes a single Mongoose connection shared across all modules
 * - Reads MONGO_URI from ConfigService (validated at startup)
 * - @Global() so MongooseModule.forRoot() connection is available everywhere
 *   without re-importing this module in every feature module
 *
 * Usage:
 * - This module is imported ONCE in CoreModule
 * - Feature modules register their own schemas via:
 *     MongooseModule.forFeature([{ name: MyDoc.name, schema: MyDocSchema }])
 *
 * Multi-tenancy note:
 * - MongoDB does NOT use the AsyncLocalStorage tenant middleware
 * - Every repository method MUST receive tenantId explicitly and include
 *   it in every query/insert — enforced by TypeScript via MongoDocument base type
 *
 * Optional dependency handling:
 * - MONGO_URI is optional in env.validation.ts (z.optional())
 * - When absent, Mongoose is configured with a sentinel URI that produces
 *   a deliberate connection failure rather than crashing bootstrap.
 * - WHY: MongoDB backs AI/RAG audit logs (fire-and-forget writes). The core
 *   CRM — auth, leads, deals, contacts — runs on Postgres only. Requiring
 *   MongoDB at boot makes Postgres-only environments (CI smoke tests, staging
 *   without RAG) impossible without running a full observability stack.
 * - In production, MONGO_URI MUST be set and the /health/ready check will
 *   surface a disconnected Mongoose connection as a readiness failure.
 */

import { Global, Logger, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';

const logger = new Logger('MongoModule');

@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const uri = config.get<string>('MONGO_URI');

        if (!uri) {
          // MONGO_URI not set — MongoDB features (AI audit logs, RAG) are disabled.
          // We do NOT crash bootstrap: the sentinel URI causes Mongoose to attempt
          // a connection that immediately fails, but Mongoose handles this gracefully
          // (logs an error, does not throw). All MongoDB repositories will fail at
          // call time, not at startup — callers use fire-and-forget with .catch().
          // /health/ready will reflect the disconnected state if it checks Mongoose.
          logger.warn(
            'MONGO_URI is not set — MongoDB connection disabled. ' +
            'AI audit logging and RAG features will not function. ' +
            'Set MONGO_URI in production.',
          );
          return {
            uri: 'mongodb://127.0.0.1:27017/__disabled__',
            serverSelectionTimeoutMS: 1000, // Fail fast — don't hold up health checks
            connectTimeoutMS: 1000,
          };
        }

        return {
          uri,
          // Connection pool — matches Prisma's default pool size
          maxPoolSize: 10,
          minPoolSize: 2,
          // Timeout settings aligned with NestJS lifecycle
          serverSelectionTimeoutMS: 5000,
          connectTimeoutMS: 10000,
          socketTimeoutMS: 45000,
          // Automatically retry writes once on transient network errors
          retryWrites: true,
          appName: 'crm-saas',
        };
      },
    }),
  ],
  // MongooseModule connection is available globally — no exports needed here.
  // Each feature module calls MongooseModule.forFeature([...]) independently.
})
export class MongoModule {}
