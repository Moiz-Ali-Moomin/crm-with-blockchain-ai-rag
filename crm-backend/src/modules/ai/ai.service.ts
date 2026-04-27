import { Injectable, Logger, Optional, Inject, forwardRef, HttpException, HttpStatus } from '@nestjs/common';
import { VectorSearchService } from './vector-search.service';
import { CopilotService } from './copilot.service';
import { RagService } from './rag.service';
import { BlockchainService } from '../blockchain/blockchain.service';
import { PrismaService } from '../../core/database/prisma.service';
import { AiExecutorService } from './ai-executor.service';
import {
  SemanticSearchDto,
  SummarizeContactDto,
  GenerateEmailReplyDto,
  SuggestFollowUpDto,
  SummarizeActivityDto,
  RagQueryDto,
  VerifyDealWithAiDto,
  CopilotQueryDto,
} from './ai.dto';
import { AgentService } from '../mcp/agent.service';
import { ChatMessage } from './providers/llm.interface';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly vectorSearch: VectorSearchService,
    private readonly copilot: CopilotService,
    private readonly rag: RagService,
    private readonly blockchain: BlockchainService,
    private readonly prisma: PrismaService,
    private readonly executor: AiExecutorService,
    @Optional() @Inject(forwardRef(() => AgentService)) private readonly agent?: AgentService,
  ) {}

  // ── Non-LLM endpoint (vector search only) ────────────────────────────────
  // No per-user lock needed — pgvector query, not an LLM call.

  semanticSearch(tenantId: string, dto: SemanticSearchDto) {
    return this.vectorSearch.search({
      tenantId,
      query: dto.query,
      entityTypes: dto.entityTypes,
      limit: dto.limit,
      threshold: dto.threshold,
    });
  }

  // ── CopilotService endpoints — each acquires the per-user slot ────────────
  //
  // These are single-LLM-call operations. acquireUserSlot() ensures that while
  // one is in flight, the same user cannot start a second concurrent AI call
  // from another tab, endpoint, or replica.

  async summarizeContact(tenantId: string, userId: string, dto: SummarizeContactDto) {
    const release = await this.executor.acquireUserSlot(userId);
    try {
      return await this.copilot.summarizeContactHistory(
        tenantId,
        dto.contactId,
        dto.contextLimit,
      );
    } finally {
      await release();
    }
  }

  async generateEmailReply(tenantId: string, userId: string, dto: GenerateEmailReplyDto) {
    const release = await this.executor.acquireUserSlot(userId);
    try {
      return await this.copilot.generateEmailReply(
        tenantId,
        dto.communicationId,
        dto.instruction,
      );
    } finally {
      await release();
    }
  }

  async suggestFollowUp(tenantId: string, userId: string, dto: SuggestFollowUpDto) {
    const release = await this.executor.acquireUserSlot(userId);
    try {
      return await this.copilot.suggestFollowUp(
        tenantId,
        dto.entityType,
        dto.entityId,
      );
    } finally {
      await release();
    }
  }

  async summarizeActivity(tenantId: string, userId: string, dto: SummarizeActivityDto) {
    const release = await this.executor.acquireUserSlot(userId);
    try {
      return await this.copilot.summarizeActivityTimeline(
        tenantId,
        dto.entityType,
        dto.entityId,
        dto.contextLimit,
      );
    } finally {
      await release();
    }
  }

  // ── RAG / Agent endpoint ──────────────────────────────────────────────────

  async ragQuery(
    tenantId: string,
    userId: string,
    userRole: string,
    dto: RagQueryDto,
    signal?: AbortSignal,
  ) {
    // Acquire per-user slot ONCE for the entire request lifetime.
    // This covers ALL paths below (agent loop OR legacy RAG fallback).
    // The lock is held until the request completes or errors — the finally
    // block guarantees release regardless of outcome.
    const release = await this.executor.acquireUserSlot(userId);

    try {
      if (this.agent && (dto.history.length === 0 || dto.sessionId)) {
        const result = await this.agent.run({
          query: dto.query,
          tenantId,
          userId,
          userRole,
          sessionId: dto.sessionId,
          signal,
        });
        return {
          answer: result.answer,
          sources: [],
          confidence: 0,
          fromCache: false,
          agentMode: true,
          iterations: result.iterations,
          toolCallsMade: result.toolCallsMade,
        };
      }

      // Legacy RAG path (history present, no sessionId).
      // Previously this path BYPASSED the per-user lock. Fixed — it now runs
      // within the same acquired slot, preventing parallel RAG + agent calls
      // from the same user.
      return this.rag.query({
        tenantId,
        query: dto.query,
        entityTypes: dto.entityTypes,
        topK: dto.topK,
        threshold: dto.threshold,
        history: dto.history as ChatMessage[],
        signal,
      });
    } catch (err: unknown) {
      // Normalize Anthropic SDK 429 → HttpException so clients get a clean
      // 429 response instead of a 500. NEVER fall through to a second LLM
      // call — that would compound the rate-limit storm.
      if (err instanceof HttpException) throw err;
      const isAnthropicRateLimit =
        err != null &&
        typeof (err as any)['status'] === 'number' &&
        (err as any)['status'] === 429;
      if (isAnthropicRateLimit) {
        throw new HttpException(
          {
            statusCode: 429,
            error: 'Too Many Requests',
            message: 'AI provider rate limit reached. Please retry in a moment.',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw err;
    } finally {
      await release();
    }
  }

  async copilotQuery(
    tenantId: string,
    userId: string,
    userRole: string,
    dto: CopilotQueryDto,
    signal?: AbortSignal,
  ) {
    let enrichedQuery = dto.query;
    if (dto.context?.page) {
      const entity = dto.context.entityId ? ` (ID: ${dto.context.entityId})` : '';
      enrichedQuery = `[User is on the ${dto.context.page} page${entity}] ${dto.query}`;
    }

    // ragQuery acquires the per-user slot internally — do not double-acquire.
    return this.ragQuery(tenantId, userId, userRole, {
      query: enrichedQuery,
      history: dto.history ?? [],
      sessionId: dto.sessionId,
      entityTypes: ['activity', 'communication', 'ticket'],
      topK: 8,
      threshold: 0.72,
    }, signal);
  }

  // ── Deal verification — acquires per-user slot ────────────────────────────
  //
  // Previously called rag.query() directly with NO per-user lock. Fixed:
  // the slot is acquired here so verifyDeal cannot run in parallel with any
  // other AI request from the same user.

  async verifyDealWithAi(tenantId: string, userId: string, dto: VerifyDealWithAiDto) {
    const release = await this.executor.acquireUserSlot(userId);

    try {
      const [deal, chainResult] = await Promise.all([
        this.prisma.withoutTenantScope(() =>
          this.prisma.deal.findFirst({
            where: { id: dto.dealId, tenantId },
          }),
        ),
        this.blockchain.verifyDealOnChain(tenantId, dto.dealId),
      ]);

      const chainStatusText = chainResult.isValid
        ? `BLOCKCHAIN VERIFIED (${chainResult.txHash})`
        : `NOT VERIFIED`;

      const enrichedQuery = `
${chainStatusText}

Deal: ${deal?.title ?? 'unknown'}

Question: Is this deal verified and what is its status?
`;

      const ragResult = await this.rag.query({
        tenantId,
        query: enrichedQuery,
        entityTypes: ['activity', 'communication', 'ticket'],
        topK: 6,
        threshold: 0.65,
      });

      return {
        answer: ragResult.answer,
        blockchainStatus: chainResult,
        dealSnapshot: deal,
        sources: ragResult.sources,
        confidence: ragResult.confidence,
        fromCache: ragResult.fromCache,
      };
    } finally {
      await release();
    }
  }
}
