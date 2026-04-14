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
      useFactory: async (config: ConfigService) => {
        const uri = config.get<string>('MONGO_URI');

        // 🟡 CASE 1 — Mongo disabled (CI / local without RAG)
        if (!uri) {
          logger.warn(
            'MONGO_URI not set — MongoDB disabled. ' +
            'RAG, AI logs, and audit features will not work.',
          );

          return {
            uri: undefined,        // ✅ prevents parsing
            autoConnect: false,    // ✅ prevents connection attempt
          };
        }

        // 🟢 CASE 2 — Mongo enabled (production / dev with RAG)
        return {
          uri,

          // Connection pool
          maxPoolSize: 10,
          minPoolSize: 2,

          // Timeouts
          serverSelectionTimeoutMS: 5000,
          connectTimeoutMS: 10000,
          socketTimeoutMS: 45000,

          // Reliability
          retryWrites: true,
          retryReads: true,

          // App metadata
          appName: 'crm-saas',

          // ✅ Important: no deprecated / invalid options
        };
      },
    }),
  ],
})
export class MongoModule {}