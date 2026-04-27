/**
 * AI Controller — /api/v1/ai
 *
 * All endpoints require authentication (global JwtAuthGuard).
 * tenantId and userId are extracted from the JWT via the @CurrentUser() decorator.
 *
 * Every endpoint that triggers an LLM call passes userId into AiService so the
 * per-user Redis slot can be acquired exactly once for the full request lifetime.
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
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
export class AiController {
  constructor(private readonly aiService: AiService) {}

  /**
   * POST /api/v1/ai/search
   * Semantic search only — no LLM call, no per-user slot needed.
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
   */
  @Get('contact/summary')
  @ApiOperation({ summary: 'Summarize full customer history for a contact' })
  summarizeContact(
    @CurrentUser() user: { tenantId: string; id: string },
    @Query(new ZodValidationPipe(SummarizeContactSchema)) dto: SummarizeContactDto,
  ) {
    return this.aiService.summarizeContact(user.tenantId, user.id, dto);
  }

  /**
   * POST /api/v1/ai/email/reply
   */
  @Post('email/reply')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate AI email reply for a communication record' })
  generateEmailReply(
    @CurrentUser() user: { tenantId: string; id: string },
    @Body(new ZodValidationPipe(GenerateEmailReplySchema)) dto: GenerateEmailReplyDto,
  ) {
    return this.aiService.generateEmailReply(user.tenantId, user.id, dto);
  }

  /**
   * POST /api/v1/ai/follow-up
   */
  @Post('follow-up')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suggest next follow-up action for a CRM entity' })
  suggestFollowUp(
    @CurrentUser() user: { tenantId: string; id: string },
    @Body(new ZodValidationPipe(SuggestFollowUpSchema)) dto: SuggestFollowUpDto,
  ) {
    return this.aiService.suggestFollowUp(user.tenantId, user.id, dto);
  }

  /**
   * GET /api/v1/ai/activity/summary
   */
  @Get('activity/summary')
  @ApiOperation({ summary: 'Summarize activity timeline for any CRM entity' })
  summarizeActivity(
    @CurrentUser() user: { tenantId: string; id: string },
    @Query(new ZodValidationPipe(SummarizeActivitySchema)) dto: SummarizeActivityDto,
  ) {
    return this.aiService.summarizeActivity(user.tenantId, user.id, dto);
  }

  /**
   * POST /api/v1/ai/query
   * Full RAG pipeline or Agent loop depending on sessionId / history.
   */
  @Post('query')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Query CRM data in natural language (full RAG pipeline)' })
  ragQuery(
    @CurrentUser() user: { tenantId: string; id: string; role: string },
    @Body(new ZodValidationPipe(RagQuerySchema)) dto: RagQueryDto,
    @Req() req: Request,
  ) {
    return this.aiService.ragQuery(user.tenantId, user.id, user.role, dto, this.requestSignal(req));
  }

  /**
   * POST /api/v1/ai/copilot
   * Unified conversational copilot with agent tool-calling and session memory.
   */
  @Post('copilot')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unified conversational copilot with MCP agent tool-calling' })
  copilotQuery(
    @CurrentUser() user: { tenantId: string; id: string; role: string },
    @Body(new ZodValidationPipe(CopilotQuerySchema)) dto: CopilotQueryDto,
    @Req() req: Request,
  ) {
    return this.aiService.copilotQuery(user.tenantId, user.id, user.role, dto, this.requestSignal(req));
  }

  /**
   * POST /api/v1/ai/deals/verify
   * Combined RAG + Blockchain deal verification.
   */
  @Post('deals/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Combined RAG + Blockchain: verify a deal and explain its status using AI',
  })
  verifyDealWithAi(
    @CurrentUser() user: { tenantId: string; id: string },
    @Body(new ZodValidationPipe(VerifyDealWithAiSchema)) dto: VerifyDealWithAiDto,
  ) {
    return this.aiService.verifyDealWithAi(user.tenantId, user.id, dto);
  }

  private requestSignal(req: Request): AbortSignal {
    const controller = new AbortController();
    req.on('close', () => controller.abort());
    return controller.signal;
  }
}
