import { Injectable, Logger, Optional, Inject, forwardRef } from '@nestjs/common';
import { VectorSearchService } from './vector-search.service';
import { CopilotService } from './copilot.service';
import { RagService } from './rag.service';
import { BlockchainService } from '../blockchain/blockchain.service';
import { PrismaService } from '../../core/database/prisma.service';
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
    @Optional() @Inject(forwardRef(() => AgentService)) private readonly agent?: AgentService,
  ) {}

  semanticSearch(tenantId: string, dto: SemanticSearchDto) {
    return this.vectorSearch.search({
      tenantId,
      query: dto.query,
      entityTypes: dto.entityTypes,
      limit: dto.limit,
      threshold: dto.threshold,
    });
  }

  summarizeContact(tenantId: string, dto: SummarizeContactDto) {
    return this.copilot.summarizeContactHistory(
      tenantId,
      dto.contactId,
      dto.contextLimit,
    );
  }

  generateEmailReply(tenantId: string, dto: GenerateEmailReplyDto) {
    return this.copilot.generateEmailReply(
      tenantId,
      dto.communicationId,
      dto.instruction,
    );
  }

  suggestFollowUp(tenantId: string, dto: SuggestFollowUpDto) {
    return this.copilot.suggestFollowUp(
      tenantId,
      dto.entityType,
      dto.entityId,
    );
  }

  summarizeActivity(tenantId: string, dto: SummarizeActivityDto) {
    return this.copilot.summarizeActivityTimeline(
      tenantId,
      dto.entityType,
      dto.entityId,
      dto.contextLimit,
    );
  }

  async ragQuery(tenantId: string, userId: string, userRole: string, dto: RagQueryDto) {
    // Route through AgentService when available. sessionId enables multi-turn memory via Redis.
    // Legacy inline history still bypasses agent (no session) to avoid duplicate context.
    if (this.agent && (dto.history.length === 0 || dto.sessionId)) {
      try {
        const result = await this.agent.run({ query: dto.query, tenantId, userId, userRole, sessionId: dto.sessionId });
        return {
          answer: result.answer,
          sources: [],
          confidence: 0,
          fromCache: false,
          agentMode: true,
          iterations: result.iterations,
          toolCallsMade: result.toolCallsMade,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`[AiService] AgentService failed, falling back to RAG: ${message}`);
      }
    }

    return this.rag.query({
      tenantId,
      query: dto.query,
      entityTypes: dto.entityTypes,
      topK: dto.topK,
      threshold: dto.threshold,
      history: dto.history as ChatMessage[],
    });
  }

  async copilotQuery(tenantId: string, userId: string, userRole: string, dto: CopilotQueryDto) {
    // Prepend page context to the query so the agent/RAG can focus on the right scope
    let enrichedQuery = dto.query;
    if (dto.context?.page) {
      const entity = dto.context.entityId ? ` (ID: ${dto.context.entityId})` : '';
      enrichedQuery = `[User is on the ${dto.context.page} page${entity}] ${dto.query}`;
    }

    return this.ragQuery(tenantId, userId, userRole, {
      query: enrichedQuery,
      history: dto.history ?? [],
      sessionId: dto.sessionId,
      entityTypes: ['activity', 'communication', 'ticket'],
      topK: 8,
      threshold: 0.72,
    });
  }

  async verifyDealWithAi(tenantId: string, dto: VerifyDealWithAiDto) {
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
  }
}
