/**
 * AiModule
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  LLM         → Anthropic Claude (ANTHROPIC_API_KEY required)               │
 * │  Embeddings  → Ollama nomic-embed-text 768-dim (must be running locally)   │
 * │  ENABLE_AI=false OR no ANTHROPIC_API_KEY → MockEmbeddingService            │
 * └─────────────────────────────────────────────────────────────────────────────┘
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
import { AiCostControlService } from './cost-control.service';

import { EMBEDDING_SERVICE } from './embedding.interface';
import { RealEmbeddingService } from './real-embedding.service';
import { MockEmbeddingService } from './mock-embedding.service';

import { LLM_PROVIDER } from './providers/llm.interface';
import { EMBEDDING_PROVIDER } from './providers/embedding-provider.interface';
import { AIProviderFactory } from './providers/ai-provider.factory';

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
    // ── LLM_PROVIDER: Anthropic Claude ───────────────────────────────────────
    {
      provide: LLM_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => AIProviderFactory.getLLM(config),
    },

    // ── EMBEDDING_PROVIDER: Ollama (768-dim nomic-embed-text) ────────────────
    {
      provide: EMBEDDING_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => AIProviderFactory.getEmbedding(config),
    },

    // ── EMBEDDING_SERVICE: full IEmbeddingService (includes DB upsert/delete) ─
    {
      provide: EMBEDDING_SERVICE,
      inject: [ConfigService, PrismaService, EMBEDDING_PROVIDER],
      useFactory: (
        config: ConfigService,
        prisma: PrismaService,
        embeddingProvider: ReturnType<typeof AIProviderFactory.getEmbedding>,
      ) => {
        const enabled = config.get<string>('ENABLE_AI') !== 'false';
        const hasKey = !!config.get<string>('ANTHROPIC_API_KEY');

        if (enabled && hasKey) {
          return new RealEmbeddingService(prisma, embeddingProvider);
        }

        return new MockEmbeddingService();
      },
    },

    AiService,
    VectorSearchService,
    CopilotService,
    RagService,
    AiCostControlService,

    // ✅ ONLY provide repository if Mongo exists
    ...(isMongoEnabled ? [AiLogRepository] : []),
  ],

  exports: [
    LLM_PROVIDER,
    EMBEDDING_SERVICE,
    EMBEDDING_PROVIDER,
    RagService,
    AiCostControlService,
    BullModule,

    ...(isMongoEnabled ? [AiLogRepository] : []),
  ],
})
export class AiModule {}