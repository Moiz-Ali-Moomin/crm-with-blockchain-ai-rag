/**
 * AI Controller â€” /api/v1/ai
 *
 * All endpoints require authentication (global JwtAuthGuard).
 * tenantId is extracted from the JWT via the @CurrentUser() decorator.
 *
 * Rate limiting note: AI endpoints are expensive. Consider adding
 * @Throttle({ short: { limit: 5, ttl: 60000 } }) per org plan.
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { AiService } from './ai.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  SemanticSearchSchema,
  SemanticSearchDto,
  SummarizeContactSchema,
  SummarizeContactDto,
  GenerateEmailReplySchema,
  GenerateEmailReplyDto,
  SuggestFollowUpSchema,
  SuggestFollowUpDto,
  SummarizeActivitySchema,
  SummarizeActivityDto,
  RagQuerySchema,
  RagQueryDto,
  VerifyDealWithAiSchema,
  VerifyDealWithAiDto,
  CopilotQuerySchema,
  CopilotQueryDto,
} from './ai.dto';

@ApiTags('AI Copilot')
@ApiBearerAuth()
@Controller('ai')
@UseGuards(RolesGuard)
@Roles(UserRole.SALES_REP, UserRole.SALES_MANAGER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
// AI calls are expensive â€” tighten rate limits beyond the global defaults
@Throttle({ short: { limit: 5, ttl: 60_000 }, long: { limit: 100, ttl: 3_600_000 } })
export class AiController {
  constructor(private readonly aiService: AiService) {}

  /**
   * POST /api/v1/ai/search
   * Semantic search across activities, communications, and tickets.
   * Example: "customer complained about billing" â†’ returns related tickets + comms.
   */
  @Post('search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Semantic search over CRM data using natural language' })
  semanticSearch(
    @CurrentUser() user: { tenantId: string },
    @Body(new ZodValidationPipe(SemanticSearchSchema)) dto: SemanticSearchDto,
  ) {
    return this.aiService.semanticSearch(user.tenantId, dto);
  }

  /**
   * GET /api/v1/ai/contacts/:id/summary
   * Summarize all interactions with a contact (activities + comms + tickets).
   */
  @Get('contact/summary')
  @ApiOperation({ summary: 'Summarize full customer history for a contact' })
  summarizeContact(
    @CurrentUser() user: { tenantId: string },
    @Query(new ZodValidationPipe(SummarizeContactSchema)) dto: SummarizeContactDto,
  ) {
    return this.aiService.summarizeContact(user.tenantId, dto);
  }

  /**
   * POST /api/v1/ai/email/reply
   * Generate an AI-drafted reply to an inbound email communication.
   */
  @Post('email/reply')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate AI email reply for a communication record' })
  generateEmailReply(
    @CurrentUser() user: { tenantId: string },
    @Body(new ZodValidationPipe(GenerateEmailReplySchema)) dto: GenerateEmailReplyDto,
  ) {
    return this.aiService.generateEmailReply(user.tenantId, dto);
  }

  /**
   * POST /api/v1/ai/follow-up
   * Suggest the best next action for a lead, contact, or deal.
   */
  @Post('follow-up')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suggest next follow-up action for a CRM entity' })
  suggestFollowUp(
    @CurrentUser() user: { tenantId: string },
    @Body(new ZodValidationPipe(SuggestFollowUpSchema)) dto: SuggestFollowUpDto,
  ) {
    return this.aiService.suggestFollowUp(user.tenantId, dto);
  }

  /**
   * GET /api/v1/ai/activity/summary
   * Compact narrative of an entity's recent activity timeline.
   */
  @Get('activity/summary')
  @ApiOperation({ summary: 'Summarize activity timeline for any CRM entity' })
  summarizeActivity(
    @CurrentUser() user: { tenantId: string },
    @Query(new ZodValidationPipe(SummarizeActivitySchema)) dto: SummarizeActivityDto,
  ) {
    return this.aiService.summarizeActivity(user.tenantId, dto);
  }

  /**
   * POST /api/v1/ai/query
   * Full RAG pipeline: natural language â†’ embedding â†’ vector search â†’ LLM answer.
   * Query CRM data in plain English.
   * Examples:
   *   - "What happened in the last 3 interactions with Acme Corp?"
   *   - "Summarize all support tickets from this quarter"
   *   - "What is the customer sentiment around our pricing?"
   */
  @Post('query')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Query CRM data in natural language (full RAG pipeline)' })
  ragQuery(
    @CurrentUser() user: { tenantId: string; id: string; role: string },
    @Body(new ZodValidationPipe(RagQuerySchema)) dto: RagQueryDto,
  ) {
    return this.aiService.ragQuery(user.tenantId, user.id, user.role, dto);
  }

  /**
   * POST /api/v1/ai/copilot
   * Unified conversational copilot — routes through AgentService (tool-calling)
   * with optional page context and persistent session memory.
   */
  @Post('copilot')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unified conversational copilot with MCP agent tool-calling' })
  copilotQuery(
    @CurrentUser() user: { tenantId: string; id: string; role: string },
    @Body(new ZodValidationPipe(CopilotQuerySchema)) dto: CopilotQueryDto,
  ) {
    return this.aiService.copilotQuery(user.tenantId, user.id, user.role, dto);
  }

  /**
   * POST /api/v1/ai/deals/verify
   * Combined RAG + Blockchain deal verification.
   *
   * Example question: "Is this deal verified?"
   * Flow:
   *   1. Fetch deal metadata + on-chain proof from BlockchainService
   *   2. Run RAG to retrieve related activities/comms/tickets
   *   3. Inject blockchain status into context window
   *   4. GPT-4o answers with full factual grounding (no hallucination)
   *
   * Returns AI answer + blockchain proof details + deal snapshot + RAG sources.
   */
  @Post('deals/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Combined RAG + Blockchain: verify a deal and explain its status using AI',
  })
  verifyDealWithAi(
    @CurrentUser() user: { tenantId: string },
    @Body(new ZodValidationPipe(VerifyDealWithAiSchema)) dto: VerifyDealWithAiDto,
  ) {
    return this.aiService.verifyDealWithAi(user.tenantId, dto);
  }
}

