/**
 * VectorSearchService
 *
 * Performs pgvector cosine-similarity search over the `ai_embeddings` table.
 * Raw SQL is unavoidable here — Prisma's query builder doesn't support pgvector
 * operators (<=> for cosine distance).
 *
 * Index strategy (applied via raw migration):
 *   CREATE INDEX CONCURRENTLY ai_embeddings_embedding_idx
 *   ON ai_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
 * IVFFlat is suitable for up to ~1M rows. Switch to HNSW for larger datasets.
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { IEmbeddingService, EMBEDDING_SERVICE } from './embedding.interface';
import { RedisService } from '../../core/cache/redis.service';
import { CACHE_KEYS, CACHE_TTL } from '../../core/cache/cache-keys';
import { createHash } from 'crypto';

export interface SemanticSearchResult {
  id: string;
  entityType: string;
  entityId: string;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
}

// Shape returned by the raw pgvector query
interface RawEmbeddingRow {
  id: string;
  entity_type: string;
  entity_id: string;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
}

@Injectable()
export class VectorSearchService {
  private readonly logger = new Logger(VectorSearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMBEDDING_SERVICE) private readonly embeddingService: IEmbeddingService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Semantic search: embed the query, run cosine similarity, return top-k results.
   *
   * @param tenantId   — enforced at query level (not via AsyncLocalStorage —
   *                     this method is also called from workers)
   * @param query      — natural language query text
   * @param entityTypes — filter to specific entity types (default: all)
   * @param limit       — max results
   * @param threshold   — minimum similarity score 0–1 (cosine similarity)
   */
  async search(params: {
    tenantId: string;
    query: string;
    entityTypes?: string[];
    limit?: number;
    threshold?: number;
  }): Promise<SemanticSearchResult[]> {
    const {
      tenantId,
      query,
      entityTypes = ['activity', 'communication', 'ticket'],
      limit = 10,
      threshold = 0.72,
    } = params;

    // Cache key based on hash of all parameters
    const paramHash = createHash('sha256')
      .update(`${query}:${entityTypes.sort().join(',')}:${limit}:${threshold}`)
      .digest('hex')
      .slice(0, 16);
    const cacheKey = CACHE_KEYS.aiSearchResults(tenantId, paramHash);

    const cached = await this.redis.get<SemanticSearchResult[]>(cacheKey);
    if (cached) return cached;

    // Generate embedding for the query text
    const queryEmbedding = await this.embeddingService.generateEmbedding(query);

    // pgvector cosine distance is undefined for zero-magnitude vectors (division by zero).
    // MockEmbeddingService returns all-zeros when AI is disabled — bail out early.
    const magnitude = Math.sqrt(queryEmbedding.reduce((sum, v) => sum + v * v, 0));
    if (magnitude === 0) {
      this.logger.debug('Zero-magnitude embedding (AI disabled) — skipping vector search');
      return [];
    }

    const vectorLiteral = `[${queryEmbedding.join(',')}]`;

    // pgvector cosine distance: `<=>` returns 0 (identical) to 2 (opposite)
    // similarity = 1 - cosine_distance
    const rows = await this.prisma.$queryRaw<RawEmbeddingRow[]>`
      SELECT
        id,
        "entityType" AS entity_type,
        "entityId"   AS entity_id,
        content,
        metadata,
        1 - (embedding <=> ${vectorLiteral}::vector) AS similarity
      FROM ai_embeddings
      WHERE "tenantId"   = ${tenantId}
        AND "entityType" = ANY(${entityTypes}::text[])
        AND embedding IS NOT NULL
        AND 1 - (embedding <=> ${vectorLiteral}::vector) >= ${threshold}
      ORDER BY similarity DESC
      LIMIT ${limit}
    `;

    const results: SemanticSearchResult[] = rows.map((row) => ({
      id: row.id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      content: row.content,
      metadata: row.metadata ?? {},
      similarity: Number(row.similarity),
    }));

    await this.redis.set(cacheKey, results, CACHE_TTL.AI_SEARCH);

    this.logger.debug(
      `Semantic search: "${query.slice(0, 50)}..." → ${results.length} results (tenant: ${tenantId})`,
    );

    return results;
  }

  /**
   * Find nearest neighbours for a specific entity (used internally for "suggest next action").
   * Returns similar entities within the same tenant.
   */
  async findSimilarTo(params: {
    tenantId: string;
    entityType: string;
    entityId: string;
    limit?: number;
  }): Promise<SemanticSearchResult[]> {
    const { tenantId, entityType, entityId, limit = 5 } = params;

    // Fetch the source embedding via raw SQL
    const rows = await this.prisma.$queryRaw<
      { embedding: string | null }[]
    >`
      SELECT embedding::text
      FROM ai_embeddings
      WHERE "tenantId"   = ${tenantId}
        AND "entityType" = ${entityType}
        AND "entityId"   = ${entityId}
      LIMIT 1
    `;

    if (!rows.length || !rows[0].embedding) {
      return [];
    }

    const vectorLiteral = rows[0].embedding;

    const similar = await this.prisma.$queryRaw<RawEmbeddingRow[]>`
      SELECT
        id,
        "entityType" AS entity_type,
        "entityId"   AS entity_id,
        content,
        metadata,
        1 - (embedding <=> ${vectorLiteral}::vector) AS similarity
      FROM ai_embeddings
      WHERE "tenantId"  = ${tenantId}
        AND "entityId" != ${entityId}
        AND embedding  IS NOT NULL
      ORDER BY embedding <=> ${vectorLiteral}::vector
      LIMIT ${limit}
    `;

    return similar.map((row) => ({
      id: row.id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      content: row.content,
      metadata: row.metadata ?? {},
      similarity: Number(row.similarity),
    }));
  }
}
