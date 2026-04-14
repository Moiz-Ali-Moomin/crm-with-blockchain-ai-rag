/**
 * AiModule — dynamic provider selection based on ENABLE_AI feature flag
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  ENABLE_AI=true  + OPENAI_API_KEY set  →  RealEmbeddingService         │
 * │  ENABLE_AI=false OR OPENAI_API_KEY missing  →  MockEmbeddingService    │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * WHY a factory provider, not conditional module imports:
 *   NestJS resolves the DI graph at bootstrap. If RealEmbeddingService were
 *   always registered and OPENAI_API_KEY were absent, its constructor would
 *   crash before the HTTP server binds — killing /health/live. The factory
 *   delays that decision to runtime config inspection, after which only the
 *   appropriate class is instantiated.
 *
 * WHY EMBEDDING_SERVICE token, not a class:
 *   Consumers (VectorSearchService, AiEmbeddingWorker) depend on the
 *   IEmbeddingService interface via @Inject(EMBEDDING_SERVICE). The concrete
 *   class is invisible to them — swapping implementations is a module concern,
 *   not a consumer concern.
 *
 * Scalability note:
 *   The same pattern applies to any optional external integration:
 *   Stripe → PAYMENT_SERVICE token, real vs mock
 *   AWS S3 → STORAGE_SERVICE token, real vs local
 *   Twilio → SMS_SERVICE token, real vs log-only
 */

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaService } from '../../core/database/prisma.service';

import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { VectorSearchService } from './vector-search.service';
import { CopilotService } from './copilot.service';
import { RagService } from './rag.service';

import { EMBEDDING_SERVICE } from './embedding.interface';
import { RealEmbeddingService } from './real-embedding.service';
import { MockEmbeddingService } from './mock-embedding.service';

import { AiLog, AiLogSchema } from './schemas/ai-log.schema';
import { AiLogRepository } from './repositories/ai-log.repository';
import { QUEUE_NAMES } from '../../core/queue/queue.constants';
import { BlockchainModule } from '../blockchain/blockchain.module';

// 🔥 same flag as CoreModule
const isMongoEnabled = !!process.env.MONGO_URI;

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.AI_EMBEDDING }),

    // ✅ ONLY register Mongo schema if Mongo exists
    ...(isMongoEnabled
      ? [
          MongooseModule.forFeature([
            { name: AiLog.name, schema: AiLogSchema },
          ]),
        ]
      : []),

    BlockchainModule,
    ConfigModule,
  ],

  controllers: [AiController],

  providers: [
    {
      provide: EMBEDDING_SERVICE,
      inject: [ConfigService, PrismaService],
      useFactory: (config: ConfigService, prisma: PrismaService) => {
        const enabled = config.get<string>('ENABLE_AI') === 'true';
        const hasKey = !!config.get<string>('OPENAI_API_KEY');

        if (enabled && hasKey) {
          return new RealEmbeddingService(config, prisma);
        }

        return new MockEmbeddingService();
      },
    },

    AiService,
    VectorSearchService,
    CopilotService,
    RagService,

    // ✅ ONLY provide repository if Mongo exists
    ...(isMongoEnabled ? [AiLogRepository] : []),
  ],

  exports: [
    EMBEDDING_SERVICE,
    RagService,
    BullModule,

    ...(isMongoEnabled ? [AiLogRepository] : []),
  ],
})
export class AiModule {}