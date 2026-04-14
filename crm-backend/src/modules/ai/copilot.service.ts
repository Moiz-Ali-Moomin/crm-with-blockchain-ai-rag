import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../core/database/prisma.service';
import { RedisService } from '../../core/cache/redis.service';
import { CACHE_KEYS, CACHE_TTL } from '../../core/cache/cache-keys';
import { AiLogRepository } from './repositories/ai-log.repository';
import { AiOperationType } from './types/ai-operation-type.enum';
import OpenAI from 'openai';
import { Prisma } from '@prisma/client';

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

@Injectable()
export class CopilotService {
  private readonly logger = new Logger(CopilotService.name);
  private readonly openai: OpenAI;
  private readonly model = 'gpt-4o';

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Optional() private readonly aiLogRepo?: AiLogRepository,
  ) {
    this.openai = new OpenAI({
      apiKey: this.config.get<string>('OPENAI_API_KEY') ?? '',
    });
  }

  // ─────────────────────────────────────────────────────────────
  // CONTACT SUMMARY
  // ─────────────────────────────────────────────────────────────

  async summarizeContactHistory(
    tenantId: string,
    contactId: string,
    contextLimit = 20,
  ): Promise<{ summary: string; keyPoints: string[]; sentiment: string }> {
    const cacheKey = CACHE_KEYS.aiSummary(tenantId, 'contact', contactId);
    const cached = await this.redis.get<any>(cacheKey);

    if (cached) return cached;

    const context = await this.buildContactContext(
      tenantId,
      contactId,
      contextLimit,
    );

    if (!context.hasData) {
      return {
        summary: 'No interaction history found for this contact.',
        keyPoints: [],
        sentiment: 'neutral',
      };
    }

    const completion = await this.openai.chat.completions.create({
      model: this.model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You are a CRM analyst. Return JSON: summary, keyPoints, sentiment.',
        },
        {
          role: 'user',
          content: context.narrative,
        },
      ],
    });

    const raw = completion.choices[0].message.content ?? '{}';
    const result = JSON.parse(raw);

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
  ): Promise<{ reply: string }> {
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

    const completion = await this.openai.chat.completions.create({
      model: this.model,
      temperature: 0.3,
      max_tokens: 500,
      messages: [
        {
          role: 'system',
          content: 'You are a CRM assistant writing email replies.',
        },
        {
          role: 'user',
          content: `${emailContext}\n\nInstruction: ${
            instruction ?? 'Reply professionally'
          }`,
        },
      ],
    });

    return {
      reply: completion.choices[0].message.content ?? '',
    };
  }

  // ─────────────────────────────────────────────────────────────
  // FOLLOW-UP
  // ─────────────────────────────────────────────────────────────

  async suggestFollowUp(
    tenantId: string,
    entityType: string,
    entityId: string,
  ): Promise<{ suggestion: string }> {
    const activities = await this.prisma.activity.findMany({
      where: { tenantId, entityId },
      take: 10,
    });

    if (!activities.length) {
      return { suggestion: 'No recent activity found.' };
    }

    const context = activities.map((a) => a.subject).join('\n');

    const completion = await this.openai.chat.completions.create({
      model: this.model,
      temperature: 0.2,
      max_tokens: 300,
      messages: [
        {
          role: 'system',
          content: 'You suggest next best follow-up actions in CRM.',
        },
        {
          role: 'user',
          content: `Activity:\n${context}\n\nSuggest next action.`,
        },
      ],
    });

    return {
      suggestion: completion.choices[0].message.content ?? '',
    };
  }

  // ─────────────────────────────────────────────────────────────
  // ACTIVITY SUMMARY
  // ─────────────────────────────────────────────────────────────

  async summarizeActivityTimeline(
    tenantId: string,
    entityType: string,
    entityId: string,
    limit = 20,
  ): Promise<{ summary: string }> {
    const activities = await this.prisma.activity.findMany({
      where: { tenantId, entityId },
      take: limit,
    });

    if (!activities.length) {
      return { summary: 'No activity timeline found.' };
    }

    const timeline = activities.map((a) => a.subject).join('\n');

    const completion = await this.openai.chat.completions.create({
      model: this.model,
      temperature: 0.2,
      max_tokens: 400,
      messages: [
        {
          role: 'system',
          content: 'You summarize CRM timelines clearly.',
        },
        {
          role: 'user',
          content: `Timeline:\n${timeline}\n\nSummarize.`,
        },
      ],
    });

    return {
      summary: completion.choices[0].message.content ?? '',
    };
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