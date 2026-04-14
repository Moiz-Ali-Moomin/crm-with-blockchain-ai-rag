import { Injectable } from '@nestjs/common';
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
} from './ai.dto';

@Injectable()
export class AiService {
  constructor(
    private readonly vectorSearch: VectorSearchService,
    private readonly copilot: CopilotService,
    private readonly rag: RagService,
    private readonly blockchain: BlockchainService,
    private readonly prisma: PrismaService,
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

  ragQuery(tenantId: string, dto: RagQueryDto) {
    return this.rag.query({
      tenantId,
      query: dto.query,
      entityTypes: dto.entityTypes,
      topK: dto.topK,
      threshold: dto.threshold,
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