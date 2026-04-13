/**
 * RagService — Retrieval-Augmented Generation pipeline
 *
 * Orchestration layer that chains together:
 *   1. Vector search   — find semantically similar CRM records
 *   2. Context window  — format top-K results into a prompt context
 *   3. LLM completion  — GPT-4o answers the query using only retrieved facts
 *   4. Caching         — identical query+filter combos cached for 2 minutes
 *   5. Audit log       — every call persisted to MongoDB (fire-and-forget)
 *
 * Tenant isolation:
 *   - Every DB query includes tenantId constraint (pgvector WHERE clause)
 *   - Cache keys are namespaced per tenant
 *   - MongoDB logs always carry tenantId
 *
 * Prompt injection defence:
 *   - System prompt is static and hardcoded — no user input reaches it
 *   - User question is placed in the `user` message, not the `system` message
 *   - Temperature is 0.2 (near-deterministic) for factual retrieval tasks
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { createHash } from 'crypto';
import { VectorSearchService, SemanticSearchResult } from './vector-search.service';
import { AiLogRepository } from './repositories/ai-log.repository';
import { RedisService } from '../../core/cache/redis.service';
import { CACHE_KEYS, CACHE_TTL } from '../../core/cache/cache-keys';

// ── Type Definitions ────────────────────────────────────────────────────────

export interface RagQueryParams {
  tenantId: string;
  query: string;
  /** Filter to specific entity types (default: all three) */
  entityTypes?: ('activity' | 'communication' | 'ticket')[];
  /** Max number of context chunks to retrieve (default: 8) */
  topK?: number;
  /** Minimum cosine similarity threshold 0–1 (default: 0.72) */
  threshold?: number;
}

export interface RagSource {
  entityType: string;
  entityId: string;
  similarity: number;
  excerpt: string; // First 200 chars of the chunk
}

export interface RagResponse {
  answer: string;
  sources: RagSource[];
  confidence: number;    // Average similarity of retrieved chunks (0–1)
  fromCache: boolean;
  latencyMs?: number;
  tokensUsed?: number;
}

// ── Constants ───────────────────────────────────────────────────────────────

/** Hard cap on context string length to stay within GPT-4o's context window */
const MAX_CONTEXT_CHARS = 12_000;

const RAG_SYSTEM_PROMPT = `You are an intelligent CRM assistant with access to retrieved customer interaction records.

Your task: answer the user's question using ONLY the provided CRM context below.

Rules:
1. Base your answer strictly on the provided context — never invent facts.
2. If the context does not contain enough information, say so clearly.
3. Be concise and factual. Avoid filler phrases.
4. When referring to specific events, cite the record type (e.g. "In an email on...").
5. If asked about verification or blockchain status, include that information if present in the context.`;

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);
  private readonly openai: OpenAI;
  private readonly model = 'gpt-4o';

  constructor(
    private readonly config: ConfigService,
    private readonly vectorSearch: VectorSearchService,
    private readonly aiLogRepo: AiLogRepository,
    private readonly redis: RedisService,
  ) {
    // WHY get() not getOrThrow(): OPENAI_API_KEY is z.optional() in env.validation.ts.
    // Throwing in the constructor crashes NestJS bootstrap for ALL modules — auth,
    // leads, deals — even though they have no dependency on OpenAI whatsoever.
    // Instead we defer the guard to call time in query(), where it belongs.
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    this.openai = new OpenAI({
      apiKey: apiKey ?? 'not-configured',
    });
  }

  /**
   * Execute a RAG query:
   *   embed query → retrieve chunks → build context → call LLM → return answer
   *
   * @param params  - Query parameters (tenant-scoped)
   * @returns       - LLM answer with source attribution and confidence score
   */
  async query(params: RagQueryParams): Promise<RagResponse> {
    // Guard here, not in constructor — fail the specific request, not the entire process.
    if (!this.config.get<string>('OPENAI_API_KEY')) {
      throw new Error('RAG queries are unavailable: OPENAI_API_KEY is not configured.');
    }

    const {
      tenantId,
      query,
      entityTypes = ['activity', 'communication', 'ticket'],
      topK = 8,
      threshold = 0.72,
    } = params;

    // ── Cache lookup ──────────────────────────────────────────────────────────
    const paramHash = createHash('sha256')
      .update(`${query}:${[...entityTypes].sort().join(',')}:${topK}:${threshold}`)
      .digest('hex')
      .slice(0, 16);

    const cacheKey = CACHE_KEYS.aiSearchResults(tenantId, `rag:${paramHash}`);
    const cached = await this.redis.get<RagResponse>(cacheKey);

    if (cached) {
      this.logger.debug(`RAG cache hit: "${query.slice(0, 50)}" (tenant: ${tenantId})`);
      this.logFireAndForget({
        tenantId,
        operationType: 'rag_query',
        prompt: `[cached] ${query}`,
        response: cached.answer,
        servedFromCache: true,
        metadata: { entityTypes, topK, threshold, queryHash: paramHash },
      });
      return { ...cached, fromCache: true };
    }

    // ── Retrieval phase ───────────────────────────────────────────────────────
    const chunks = await this.vectorSearch.search({
      tenantId,
      query,
      entityTypes,
      limit: topK,
      threshold,
    });

    if (chunks.length === 0) {
      const noContextResponse: RagResponse = {
        answer:
          'I could not find any relevant records in your CRM to answer this question. ' +
          'This may be because no matching activities, communications, or tickets have been indexed yet.',
        sources: [],
        confidence: 0,
        fromCache: false,
      };

      this.logFireAndForget({
        tenantId,
        operationType: 'rag_query',
        prompt: query,
        response: noContextResponse.answer,
        metadata: { entityTypes, topK, threshold, retrivedChunks: 0 },
      });

      return noContextResponse;
    }

    // ── Augmentation phase ────────────────────────────────────────────────────
    const contextWindow = this.buildContextWindow(chunks);
    const userMessage = `CRM Context:\n\n${contextWindow}\n\n---\nQuestion: ${query}`;

    // ── Generation phase ──────────────────────────────────────────────────────
    const startMs = Date.now();
    const completion = await this.openai.chat.completions.create({
      model: this.model,
      temperature: 0.2,
      max_tokens: 800,
      messages: [
        { role: 'system', content: RAG_SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
    });
    const latencyMs = Date.now() - startMs;

    const answer = completion.choices[0].message.content ?? 'Unable to generate a response.';
    const tokensUsed = completion.usage?.total_tokens;

    const avgSimilarity =
      chunks.reduce((sum, c) => sum + c.similarity, 0) / chunks.length;

    const sources: RagSource[] = chunks.map((c) => ({
      entityType: c.entityType,
      entityId:   c.entityId,
      similarity: Math.round(c.similarity * 1000) / 1000,
      excerpt:    c.content.slice(0, 200),
    }));

    const result: RagResponse = {
      answer,
      sources,
      confidence: Math.round(avgSimilarity * 1000) / 1000,
      fromCache:  false,
      latencyMs,
      tokensUsed,
    };

    // ── Cache result ──────────────────────────────────────────────────────────
    await this.redis.set(cacheKey, result, CACHE_TTL.AI_SEARCH);

    // ── Audit log (fire-and-forget) ───────────────────────────────────────────
    this.logFireAndForget({
      tenantId,
      operationType: 'rag_query',
      prompt: userMessage,
      response: answer,
      latencyMs,
      promptTokens:     completion.usage?.prompt_tokens,
      completionTokens: completion.usage?.completion_tokens,
      totalTokens:      tokensUsed,
      metadata: {
        model: this.model,
        temperature: 0.2,
        entityTypes,
        topK,
        threshold,
        retrievedChunks: chunks.length,
        avgSimilarity: result.confidence,
        queryHash: paramHash,
      },
    });

    this.logger.log(
      `RAG query: "${query.slice(0, 60)}" → ${chunks.length} chunks, ` +
      `confidence=${result.confidence}, latency=${latencyMs}ms (tenant: ${tenantId})`,
    );

    return result;
  }

  // ── Private Helpers ────────────────────────────────────────────────────────

  /**
   * Format retrieved chunks into a context window string.
   * Respects MAX_CONTEXT_CHARS budget — avoids overflowing GPT's context.
   */
  private buildContextWindow(chunks: SemanticSearchResult[]): string {
    const lines: string[] = [];
    let charCount = 0;

    for (const [i, chunk] of chunks.entries()) {
      const header = `[${i + 1}] ${chunk.entityType.toUpperCase()} (id: ${chunk.entityId}, similarity: ${chunk.similarity.toFixed(3)})`;
      const body   = chunk.content.slice(0, 1500); // Cap individual chunk at 1500 chars
      const block  = `${header}\n${body}`;

      if (charCount + block.length > MAX_CONTEXT_CHARS) break;

      lines.push(block);
      charCount += block.length + 2; // +2 for \n\n separator
    }

    return lines.join('\n\n');
  }

  /**
   * Fire-and-forget MongoDB log write.
   * Never throws, never awaited — must not add latency to response path.
   */
  private logFireAndForget(params: {
    tenantId: string;
    operationType: Parameters<AiLogRepository['create']>[0]['operationType'];
    prompt: string;
    response: string;
    latencyMs?: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    servedFromCache?: boolean;
    metadata?: Record<string, unknown>;
  }): void {
    this.aiLogRepo
      .create({
        tenantId:         params.tenantId,
        operationType:    params.operationType,
        prompt:           params.prompt,
        response:         params.response,
        latencyMs:        params.latencyMs,
        promptTokens:     params.promptTokens,
        completionTokens: params.completionTokens,
        totalTokens:      params.totalTokens,
        servedFromCache:  params.servedFromCache ?? false,
        metadata:         params.metadata ?? {},
      })
      .catch((err: Error) => {
        this.logger.warn(`RAG audit log write failed: ${err.message}`);
      });
  }
}
