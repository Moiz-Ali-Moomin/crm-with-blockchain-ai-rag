/**
 * RagService — Retrieval-Augmented Generation pipeline
 *
 * Orchestration layer that chains together:
 *   1. AI cost quota check  — per-tenant monthly token budget
 *   2. Cache lookup         — identical query+filter combos cached for 2 minutes
 *   3. Vector search        — find semantically similar CRM records
 *   4. Context window       — format top-K results into a prompt context
 *   5. LLM completion       — answers the query using only retrieved facts
 *      └─ wrapped in CircuitBreaker — fast-fails if LLM provider is degraded
 *      └─ primary: Anthropic (Claude Sonnet) → fallback: OpenAI (GPT-4o)
 *   6. Usage recording      — token count recorded for billing + quota
 *   7. Business metrics     — latency histogram + token counter → Grafana
 *   8. Audit log            — every call persisted to MongoDB (fire-and-forget)
 *
 * Tenant isolation:
 *   - Every DB query includes tenantId constraint (pgvector WHERE clause)
 *   - Cache keys are namespaced per tenant
 *   - MongoDB logs always carry tenantId
 *
 * Prompt injection defence:
 *   - System prompt is static and hardcoded — no user input reaches it
 *   - User question is placed in the `prompt` field, not the `system` field
 *   - Temperature is 0.2 (near-deterministic) for factual retrieval tasks
 */

import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { VectorSearchService, SemanticSearchResult } from './vector-search.service';
import { ChatMessage } from './providers/llm.interface';
import { AiLogRepository } from './repositories/ai-log.repository';
import { RedisService } from '../../core/cache/redis.service';
import { CACHE_KEYS, CACHE_TTL } from '../../core/cache/cache-keys';
import { AiOperationType } from './types/ai-operation-type.enum';
import { CircuitBreakerService } from '../../core/resilience/circuit-breaker.service';
import { AiCostControlService, AiTier } from './cost-control.service';
import { BusinessMetricsService } from '../../core/metrics/business-metrics.service';
import { LLMProvider, LLM_PROVIDER } from './providers/llm.interface';
import { DbFallbackService } from './db-fallback.service';
import { AiExecutorService, uniqueCallKey } from './ai-executor.service';
import { QUEUE_NAMES } from '../../core/queue/queue.constants';
import { EmbeddingJobPayload } from './ai.dto';

export interface RagQueryParams {
  tenantId: string;
  query: string;
  tier?: AiTier;
  entityTypes?: ('activity' | 'communication' | 'ticket')[];
  topK?: number;
  threshold?: number;
  history?: ChatMessage[];
  signal?: AbortSignal;
}

export interface RagSource {
  entityType: string;
  entityId: string;
  similarity: number;
  excerpt: string;
}

export interface RagResponse {
  answer: string;
  sources: RagSource[];
  confidence: number;
  fromCache: boolean;
  latencyMs?: number;
  tokensUsed?: number;
}

const MAX_CONTEXT_CHARS = 12_000;
const ESTIMATED_TOKENS_PER_REQUEST = 1_200; // conservative upfront estimate

const RAG_SYSTEM_PROMPT = `You are an intelligent CRM assistant with access to retrieved customer interaction records.

Answer ONLY using provided context. If not enough info, say so. Be concise and factual.`;

const FALLBACK_SYSTEM_PROMPT = `You are an intelligent CRM assistant. No matching records were found in the database for this query, so answer based on your general knowledge of CRM best practices. Be concise and helpful. Mention that your answer is not based on live CRM data.`;

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly vectorSearch: VectorSearchService,
    private readonly redis: RedisService,
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly costControl: AiCostControlService,
    private readonly businessMetrics: BusinessMetricsService,
    private readonly dbFallback: DbFallbackService,
    private readonly executor: AiExecutorService,
    @Inject(LLM_PROVIDER) private readonly llmProvider: LLMProvider,
    @InjectQueue(QUEUE_NAMES.AI_EMBEDDING) private readonly embeddingQueue: Queue<EmbeddingJobPayload>,
    @Optional() private readonly aiLogRepo?: AiLogRepository,
  ) {}

  async query(params: RagQueryParams): Promise<RagResponse> {
    const {
      tenantId,
      query,
      tier = 'free',
      entityTypes = ['activity', 'communication', 'ticket'],
      topK = 8,
      threshold = 0.72,
      history = [],
      signal,
    } = params;

    // ── 0. Key guard — fail fast before any I/O ──────────────────────────────
    const anthropicKey = this.config.get<string>('ANTHROPIC_API_KEY');
    const aiEnabled    = this.config.get<string>('ENABLE_AI') !== 'false';

    if (!aiEnabled || !anthropicKey) {
      return {
        answer: 'AI features are not configured. Please set ANTHROPIC_API_KEY.',
        sources: [],
        confidence: 0,
        fromCache: false,
      };
    }

    // ── 1. Quota check (before touching any LLM) ─────────────────────────────
    await this.costControl.assertQuota(tenantId, tier, ESTIMATED_TOKENS_PER_REQUEST);

    // ── 2. Cache lookup ──────────────────────────────────────────────────────
    const paramHash = createHash('sha256')
      .update(`${query}:${[...entityTypes].sort().join(',')}:${topK}:${threshold}`)
      .digest('hex')
      .slice(0, 16);

    const cacheKey = CACHE_KEYS.aiSearchResults(tenantId, `rag:${paramHash}`);
    // Conversational queries are never identical — skip cache when history is present
    const cached = history.length === 0 ? await this.redis.get<RagResponse>(cacheKey) : null;

    if (cached) {
      this.businessMetrics.recordAiUsage({
        tenantId,
        tokensUsed: 0,
        latencyMs: 0,
        model: 'cached',
        cached: true,
      });

      this.logFireAndForget({
        tenantId,
        operationType: AiOperationType.RAG_QUERY,
        prompt: `[cached] ${query}`,
        response: cached.answer,
        metadata: { entityTypes, topK, threshold },
      });

      return { ...cached, fromCache: true };
    }

    // ── 3. Vector search ─────────────────────────────────────────────────────
    const chunks = await this.vectorSearch.search({
      tenantId,
      query,
      entityTypes,
      limit: topK,
      threshold,
      signal,
    });

    // ── 3b. DB fallback — query Postgres directly when pgvector has no results ─
    let contextWindow  = '';
    let hasContext     = chunks.length > 0;
    let dbEmbeddingJobs: Omit<EmbeddingJobPayload, 'action'>[] = [];

    if (hasContext) {
      contextWindow = this.buildContextWindow(chunks);
    } else {
      const fallback = await this.dbFallback.fetchContext(tenantId, query);
      if (fallback.context) {
        contextWindow    = fallback.context;
        hasContext       = true;
        dbEmbeddingJobs  = fallback.embeddingJobs;
        this.logger.log(`[RAG] DB fallback: ${dbEmbeddingJobs.length} records fetched for tenant=${tenantId}`);
      }
    }

    // ── 4. LLM call — ALL calls MUST go through AiExecutorService.
    //    Circuit breaker wraps the executor call so open-circuit fast-fails
    //    without consuming a queue/semaphore slot.
    //    Key: reuse paramHash for stateless queries (dedup); unique key for
    //    conversational turns (history present) since every turn is different.
    const start = Date.now();
    const execKey = history.length === 0
      ? `rag:${paramHash}:${hasContext ? 'ctx' : 'fb'}`
      : uniqueCallKey();

    const answer = await this.circuitBreaker.execute('llm', () =>
      this.executor.execute({
        key: execKey,
        fn: () =>
          this.llmProvider.generate({
            system: hasContext ? RAG_SYSTEM_PROMPT : FALLBACK_SYSTEM_PROMPT,
            prompt: query,
            context: contextWindow,
            history,
          }),
        signal,
      }),
    );

    const latencyMs = Date.now() - start;

    this.logger.log(`[RAG] LLM responded in ${latencyMs}ms`);

    // ── 5. Record actual usage (non-blocking, estimate) ───────────────────────
    const estimatedTokens = Math.ceil((contextWindow.length + query.length) / 4);
    void this.costControl.recordUsage(tenantId, estimatedTokens);

    // ── 6. Business metrics ──────────────────────────────────────────────────
    this.businessMetrics.recordAiUsage({
      tenantId,
      tokensUsed: estimatedTokens,
      latencyMs,
      model: this.config.get<string>('LLM_PROVIDER') ?? 'anthropic',
      cached: false,
    });

    const round3 = (n: number) => Math.round(n * 1000) / 1000;

    const confidence = hasContext
      ? round3(chunks.reduce((sum, c) => sum + c.similarity, 0) / chunks.length)
      : 0;

    const sources: RagSource[] = chunks.map((c) => ({
      entityType: c.entityType,
      entityId:   c.entityId,
      similarity: round3(c.similarity),
      excerpt:    c.content.slice(0, 200),
    }));

    const result: RagResponse = {
      answer,
      sources,
      confidence,
      fromCache: false,
      latencyMs,
      tokensUsed: estimatedTokens,
    };

    // ── 7. Cache + audit ─────────────────────────────────────────────────────
    await this.redis.set(cacheKey, result, CACHE_TTL.AI_SEARCH);

    // ── 8. Lazy embedding — store DB-fallback records so next query hits pgvector.
    //    Jobs are added one-by-one via a sequential for-of loop so BullMQ never
    //    receives a burst of add() calls, preventing concurrent embedding API calls.
    if (dbEmbeddingJobs.length > 0) {
      const opts = { attempts: 3, backoff: { type: 'exponential', delay: 5_000 } };
      void (async () => {
        for (const job of dbEmbeddingJobs) {
          await this.embeddingQueue.add('upsert', { ...job, action: 'upsert' } satisfies EmbeddingJobPayload, opts);
        }
      })().catch((err: Error) => {
        this.logger.warn(`[RAG] Failed to enqueue embedding jobs: ${err.message}`);
      });
      this.logger.log(`[RAG] Enqueuing ${dbEmbeddingJobs.length} lazy embedding jobs sequentially for tenant=${tenantId}`);
    }

    this.logFireAndForget({
      tenantId,
      operationType: AiOperationType.RAG_QUERY,
      prompt: query,
      response: answer,
      latencyMs,
      metadata: {
        provider: this.config.get<string>('LLM_PROVIDER') ?? 'anthropic',
        temperature: 0.2,
        tokensEstimated: estimatedTokens,
        fallback: !hasContext,
      },
    });

    return result;
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  private buildContextWindow(chunks: SemanticSearchResult[]): string {
    let output = '';
    let size = 0;

    for (const chunk of chunks) {
      const block = `[${chunk.entityType}] ${chunk.content}\n\n`;
      if (size + block.length > MAX_CONTEXT_CHARS) break;
      output += block;
      size   += block.length;
    }

    return output;
  }

  private logFireAndForget(params: {
    tenantId: string;
    operationType: AiOperationType;
    prompt: string;
    response: string;
    latencyMs?: number;
    metadata?: Record<string, unknown>;
  }): void {
    if (!this.aiLogRepo) return;

    this.aiLogRepo
      .create({
        tenantId:      params.tenantId,
        operationType: params.operationType,
        prompt:        params.prompt,
        response:      params.response,
        latencyMs:     params.latencyMs,
        metadata:      params.metadata ?? {},
      })
      .catch((err: Error) => {
        this.logger.warn(`RAG log failed: ${err.message}`);
      });
  }
}
