/**
 * RealEmbeddingService
 *
 * Production implementation of IEmbeddingService.
 * Delegates vector generation to the injected EmbeddingProvider
 * (Ollama primary → OpenAI fallback) via the EMBEDDING_PROVIDER token.
 * Persists generated vectors to ai_embeddings via Prisma + raw SQL.
 *
 * Design decisions:
 * - generateEmbedding() now calls the provider, not OpenAI directly.
 *   This is the only change from the original — all DB logic is unchanged.
 * - The EMBEDDING_PROVIDER token is injected via constructor so this class
 *   remains fully testable (mock the token in specs).
 * - Upsert is idempotent on (tenantId, entityType, entityId).
 * - Always enqueued via AiEmbeddingWorker — never on the hot path.
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { IEmbeddingService } from './embedding.interface';
import { EmbeddingProvider, EMBEDDING_PROVIDER } from './providers/embedding-provider.interface';

@Injectable()
export class RealEmbeddingService implements IEmbeddingService {
  private readonly logger = new Logger(RealEmbeddingService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMBEDDING_PROVIDER) private readonly embeddingProvider: EmbeddingProvider,
  ) {}

  async generateEmbedding(text: string): Promise<number[]> {
    return this.embeddingProvider.embed(text);
  }

  async upsertEmbedding(params: {
    tenantId: string;
    entityType: string;
    entityId: string;
    content: string;
    embedding: number[];
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const { tenantId, entityType, entityId, content, embedding, metadata } = params;

    await this.prisma.withoutTenantScope(() =>
      this.prisma.aiEmbedding.upsert({
        where: { tenantId_entityType_entityId: { tenantId, entityType, entityId } },
        create: { tenantId, entityType, entityId, content, metadata: (metadata ?? {}) as object },
        update: { content, metadata: (metadata ?? {}) as object, updatedAt: new Date() },
      }),
    );

    const vectorLiteral = `[${embedding.join(',')}]`;
    await this.prisma.$executeRaw`
      UPDATE ai_embeddings
      SET embedding = ${vectorLiteral}::vector
      WHERE tenant_id   = ${tenantId}
        AND entity_type = ${entityType}
        AND entity_id   = ${entityId}
    `;

    this.logger.debug(`Embedding upserted: ${entityType}/${entityId} (tenant: ${tenantId})`);
  }

  async deleteEmbedding(tenantId: string, entityType: string, entityId: string): Promise<void> {
    await this.prisma.withoutTenantScope(() =>
      this.prisma.aiEmbedding.deleteMany({ where: { tenantId, entityType, entityId } }),
    );
  }
}
