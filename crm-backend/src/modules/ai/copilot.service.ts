/**
 * CopilotService — AI-assisted CRM intelligence layer
 *
 * Uses the injected LLMProvider (Anthropic primary → OpenAI fallback)
 * for all generative tasks. The concrete provider is resolved at bootstrap
 * by the AIProviderFactory and invisible to this service.
 *
 * JSON response strategy:
 *   Previously used OpenAI's `response_format: { type: 'json_object' }`.
 *   Now we instruct the model via the system prompt and parse the response.
 *   This works identically across Anthropic and OpenAI.
 */

import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { RedisService } from '../../core/cache/redis.service';
import { CACHE_KEYS, CACHE_TTL } from '../../core/cache/cache-keys';
import { AiLogRepository } from './repositories/ai-log.repository';
import { Prisma } from '@prisma/client';
import { LLMProvider, LLM_PROVIDER } from './providers/llm.interface';
import { AiExecutorService, uniqueCallKey } from './ai-executor.service';
import { CircuitBreakerService } from '../../core/resilience/circuit-breaker.service';
import { AiCostControlService, AiTier } from './cost-control.service';

type CommunicationContext = Prisma.CommunicationGetPayload<{
  select: {
    id: true;
    subject: true;
    body: true;
    fromAddr: true;
    channel: true;
  };
}>;

function buildCommunicationContext(comm: CommunicationContext): string {
  const lines: string[] = [`Channel: ${comm.channel}`, `From: ${comm.fromAddr}`];
  if (comm.subject) lines.push(`Subject: ${comm.subject}`);
  lines.push(`Body:\n${comm.body}`);
  return lines.join('\n');
}

/** Safely parse JSON from LLM output, stripping markdown fences if present */
function safeParseJson<T>(raw: string): T {
  // Strip ```json ... ``` or ``` ... ``` fences that some models include
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  return JSON.parse(cleaned) as T;
}

@Injectable()
export class CopilotService {
  private readonly logger = new Logger(CopilotService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly executor: AiExecutorService,
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly costControl: AiCostControlService,
    @Inject(LLM_PROVIDER) private readonly llmProvider: LLMProvider,
    @Optional() private readonly aiLogRepo?: AiLogRepository,
  ) {}

  // ─────────────────────────────────────────────────────────────
  // CONTACT SUMMARY
  // ─────────────────────────────────────────────────────────────

  async summarizeContactHistory(
    tenantId: string,
    contactId: string,
    contextLimit = 20,
    tier: AiTier = 'free',
  ): Promise<{ summary: string; keyPoints: string[]; sentiment: string }> {
    const cacheKey = CACHE_KEYS.aiSummary(tenantId, 'contact', contactId);
    const cached = await this.redis.get<{ summary: string; keyPoints: string[]; sentiment: string }>(cacheKey);

    if (cached) return cached;

    await this.costControl.assertQuota(tenantId, tier, 800);

    const context = await this.buildContactContext(tenantId, contactId, contextLimit);

    if (!context.hasData) {
      return {
        summary: 'No interaction history found for this contact.',
        keyPoints: [],
        sentiment: 'neutral',
      };
    }

    const raw = await this.circuitBreaker.execute('llm', () =>
      this.executor.execute({
        key: `contact-summary:${tenantId}:${contactId}`,
        fn: () =>
          this.llmProvider.generate({
            system:
              'You are a CRM analyst. Return ONLY valid JSON with keys: summary (string), keyPoints (string[]), sentiment (string).',
            prompt: context.narrative,
          }),
      }),
    );
    void this.costControl.recordUsage(tenantId, Math.ceil(context.narrative.length / 4) + 300);

    this.logger.debug('[Copilot] summarizeContactHistory: LLM responded');

    const result = safeParseJson<{ summary: string; keyPoints: string[]; sentiment: string }>(raw);
    await this.redis.set(cacheKey, result, CACHE_TTL.AI_SUMMARY);
    return result;
  }

  // ─────────────────────────────────────────────────────────────
  // EMAIL REPLY
  // ─────────────────────────────────────────────────────────────

  async generateEmailReply(
    tenantId: string,
    communicationId: string,
    instruction?: string,
    tier: AiTier = 'free',
  ): Promise<{ reply: string }> {
    await this.costControl.assertQuota(tenantId, tier, 600);

    const comm = await this.prisma.communication.findFirst({
      where: { id: communicationId, tenantId },
      select: {
        id: true,
        subject: true,
        body: true,
        fromAddr: true,
        channel: true,
      },
    });

    if (!comm) {
      return { reply: 'Communication not found.' };
    }

    const emailContext = buildCommunicationContext(comm);
    const prompt = `${emailContext}\n\nInstruction: ${instruction ?? 'Reply professionally'}`;

    const reply = await this.circuitBreaker.execute('llm', () =>
      this.executor.execute({
        key: uniqueCallKey(),
        fn: () =>
          this.llmProvider.generate({
            system: 'You are a CRM assistant writing professional email replies.',
            prompt,
          }),
      }),
    );

    void this.costControl.recordUsage(tenantId, Math.ceil(prompt.length / 4) + 300);
    this.logger.debug('[Copilot] generateEmailReply: LLM responded');
    return { reply };
  }

  // ─────────────────────────────────────────────────────────────
  // FOLLOW-UP
  // ─────────────────────────────────────────────────────────────

  async suggestFollowUp(
    tenantId: string,
    entityType: string,
    entityId: string,
    tier: AiTier = 'free',
  ): Promise<{ suggestion: string }> {
    await this.costControl.assertQuota(tenantId, tier, 400);

    const activities = await this.prisma.activity.findMany({
      where: { tenantId, entityId },
      take: 10,
    });

    if (!activities.length) {
      return { suggestion: 'No recent activity found.' };
    }

    const context = activities.map((a) => a.subject).join('\n');
    const prompt = `Activity:\n${context}\n\nSuggest next action.`;

    const suggestion = await this.circuitBreaker.execute('llm', () =>
      this.executor.execute({
        key: uniqueCallKey(),
        fn: () =>
          this.llmProvider.generate({
            system: 'You suggest next best follow-up actions in CRM. Keep response concise.',
            prompt,
          }),
      }),
    );

    void this.costControl.recordUsage(tenantId, Math.ceil(prompt.length / 4) + 200);
    this.logger.debug('[Copilot] suggestFollowUp: LLM responded');
    return { suggestion };
  }

  // ─────────────────────────────────────────────────────────────
  // ACTIVITY SUMMARY
  // ─────────────────────────────────────────────────────────────

  async summarizeActivityTimeline(
    tenantId: string,
    entityType: string,
    entityId: string,
    limit = 20,
    tier: AiTier = 'free',
  ): Promise<{ summary: string }> {
    await this.costControl.assertQuota(tenantId, tier, 500);

    const activities = await this.prisma.activity.findMany({
      where: { tenantId, entityId },
      take: limit,
    });

    if (!activities.length) {
      return { summary: 'No activity timeline found.' };
    }

    const timeline = activities.map((a) => a.subject).join('\n');
    const prompt = `Timeline:\n${timeline}\n\nSummarize.`;

    const summary = await this.circuitBreaker.execute('llm', () =>
      this.executor.execute({
        key: `activity-summary:${tenantId}:${entityId}`,
        fn: () =>
          this.llmProvider.generate({
            system: 'You summarize CRM timelines clearly and concisely.',
            prompt,
          }),
      }),
    );

    void this.costControl.recordUsage(tenantId, Math.ceil(prompt.length / 4) + 200);
    this.logger.debug('[Copilot] summarizeActivityTimeline: LLM responded');
    return { summary };
  }

  // ─────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────

  private async buildContactContext(
    tenantId: string,
    contactId: string,
    limit: number,
  ): Promise<{ narrative: string; hasData: boolean }> {
    const activities = await this.prisma.activity.findMany({
      where: { tenantId, entityId: contactId },
      take: limit,
    });

    if (!activities.length) {
      return { narrative: '', hasData: false };
    }

    return {
      hasData: true,
      narrative: activities.map((a) => a.subject ?? '').join('\n'),
    };
  }
}