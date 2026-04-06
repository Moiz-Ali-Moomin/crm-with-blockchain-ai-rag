/**
 * LeadScoringService
 *
 * Computes a deterministic 0–100 lead score based on observable CRM signals.
 * Designed to be extendable: the scoring factors are isolated and weighted —
 * swap the `computeScore()` internals for an ML model call without changing callers.
 *
 * Scoring factors (total = 100 points):
 *  ┌─────────────────────────────┬───────┐
 *  │ Factor                      │ Max   │
 *  ├─────────────────────────────┼───────┤
 *  │ Profile completeness        │  20   │
 *  │ Activity frequency (30d)    │  25   │
 *  │ Recency (last contact)      │  25   │
 *  │ Email engagement            │  15   │
 *  │ Status weight               │  15   │
 *  └─────────────────────────────┴───────┘
 *
 * The score is cached in Redis (5 min TTL) and persisted back to `lead.score`
 * in a fire-and-forget update — the cache read path is the hot path.
 *
 * Integration points:
 *  - leads.service.ts calls `enqueueScoreUpdate()` after create/update/assign
 *  - analytics.controller.ts exposes GET /analytics/leads/:id/score
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { RedisService } from '../../core/cache/redis.service';
import { CACHE_KEYS, CACHE_TTL } from '../../core/cache/cache-keys';
import { subDays, differenceInDays } from 'date-fns';

export interface LeadScoreBreakdown {
  total: number;
  profileCompleteness: number;
  activityFrequency: number;
  recency: number;
  emailEngagement: number;
  statusWeight: number;
  computedAt: string;
}

@Injectable()
export class LeadScoringService {
  private readonly logger = new Logger(LeadScoringService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Return the score for a lead — serve from cache if warm, otherwise compute.
   */
  async getScore(tenantId: string, leadId: string): Promise<LeadScoreBreakdown> {
    const cacheKey = CACHE_KEYS.leadScore(tenantId, leadId);
    const cached = await this.redis.get<LeadScoreBreakdown>(cacheKey);
    if (cached) return cached;

    return this.computeAndCache(tenantId, leadId);
  }

  /**
   * Force-recompute the score, persist to DB, update cache.
   * Called by the LeadScoringWorker (when enqueued by leads.service.ts).
   */
  async recomputeScore(tenantId: string, leadId: string): Promise<LeadScoreBreakdown> {
    return this.computeAndCache(tenantId, leadId);
  }

  /**
   * Batch-score all leads for a tenant (useful for initial backfill).
   * Processes in chunks of 50 to avoid memory pressure.
   */
  async batchRecomputeForTenant(tenantId: string): Promise<void> {
    let cursor: string | undefined;
    let processed = 0;
    let hasMore = true;

    while (hasMore) {
      const leads = await this.prisma.withoutTenantScope(() =>
        this.prisma.lead.findMany({
          where: { tenantId },
          select: { id: true },
          take: 50,
          skip: cursor ? 1 : 0,
          cursor: cursor ? { id: cursor } : undefined,
          orderBy: { id: 'asc' },
        }),
      );

      if (!leads.length) {
        hasMore = false;
        continue;
      }

      await Promise.all(
        leads.map((l) => this.computeAndCache(tenantId, l.id)),
      );

      processed += leads.length;
      cursor = leads[leads.length - 1].id;

      this.logger.debug(`Batch scored ${processed} leads for tenant ${tenantId}`);
    }
  }

  // ─── Core Scoring Logic ───────────────────────────────────────────────────

  private async computeAndCache(
    tenantId: string,
    leadId: string,
  ): Promise<LeadScoreBreakdown> {
    const now = new Date();
    const thirtyDaysAgo = subDays(now, 30);

    // Fetch all signals in parallel — avoids N+1
    const [lead, activityCount, communications] = await Promise.all([
      this.prisma.withoutTenantScope(() =>
        this.prisma.lead.findFirst({
          where: { id: leadId, tenantId },
          select: {
            email: true,
            phone: true,
            companyName: true,
            jobTitle: true,
            status: true,
            lastContactedAt: true,
            source: true,
          },
        }),
      ),
      // Activities logged against this lead in last 30 days
      this.prisma.withoutTenantScope(() =>
        this.prisma.activity.count({
          where: {
            tenantId,
            entityType: 'LEAD',
            entityId: leadId,
            createdAt: { gte: thirtyDaysAgo },
          },
        }),
      ),
      // Email communications for engagement signals
      this.prisma.withoutTenantScope(() =>
        this.prisma.communication.findMany({
          where: {
            tenantId,
            channel: 'EMAIL',
            entityType: 'LEAD',
            entityId: leadId,
          },
          select: { status: true, createdAt: true },
        }),
      ),
    ]);

    if (!lead) {
      this.logger.warn(`Lead ${leadId} not found for scoring`);
      const empty: LeadScoreBreakdown = {
        total: 0,
        profileCompleteness: 0,
        activityFrequency: 0,
        recency: 0,
        emailEngagement: 0,
        statusWeight: 0,
        computedAt: now.toISOString(),
      };
      return empty;
    }

    // ── Factor 1: Profile Completeness (max 20) ──────────────────────────────
    let profileCompleteness = 0;
    if (lead.email) profileCompleteness += 8;
    if (lead.phone) profileCompleteness += 6;
    if (lead.companyName) profileCompleteness += 4;
    if (lead.jobTitle) profileCompleteness += 2;

    // ── Factor 2: Activity Frequency in last 30 days (max 25) ────────────────
    // 1 activity = 5 pts, 2 = 10, 3 = 15, 4 = 20, 5+ = 25
    const activityFrequency = Math.min(activityCount * 5, 25);

    // ── Factor 3: Recency of last contact (max 25) ────────────────────────────
    // 0–3 days = 25 pts | 4–7 days = 20 | 8–14 = 15 | 15–30 = 8 | 31+ = 0
    let recency = 0;
    if (lead.lastContactedAt) {
      const daysSince = differenceInDays(now, new Date(lead.lastContactedAt));
      if (daysSince <= 3) recency = 25;
      else if (daysSince <= 7) recency = 20;
      else if (daysSince <= 14) recency = 15;
      else if (daysSince <= 30) recency = 8;
      else recency = 0;
    }

    // ── Factor 4: Email Engagement (max 15) ───────────────────────────────────
    // Counts OPENED and CLICKED statuses — proxy for real engagement
    let emailEngagement = 0;
    const opened = communications.filter((c) => c.status === 'OPENED').length;
    const clicked = communications.filter((c) => c.status === 'CLICKED').length;
    // 3 pts per open (max 9), 6 pts per click (max 6)
    emailEngagement = Math.min(opened * 3, 9) + Math.min(clicked * 6, 6);

    // ── Factor 5: Status Weight (max 15) ──────────────────────────────────────
    // Reflects how far along the funnel the lead is
    const statusWeights: Record<string, number> = {
      NEW: 5,
      CONTACTED: 8,
      NURTURING: 10,
      QUALIFIED: 15,
      UNQUALIFIED: 0,
      CONVERTED: 0, // Already converted — score is historical
      LOST: 0,
    };
    const statusWeight = statusWeights[lead.status] ?? 0;

    const total = Math.round(
      profileCompleteness + activityFrequency + recency + emailEngagement + statusWeight,
    );

    const breakdown: LeadScoreBreakdown = {
      total: Math.min(total, 100), // Cap at 100
      profileCompleteness,
      activityFrequency,
      recency,
      emailEngagement,
      statusWeight,
      computedAt: now.toISOString(),
    };

    // Persist score to DB (fire-and-forget — don't block caller on DB write)
    this.prisma.withoutTenantScope(() =>
      this.prisma.lead.update({
        where: { id: leadId },
        data: { score: breakdown.total },
      }),
    ).catch((err: Error) =>
      this.logger.error(`Failed to persist lead score for ${leadId}: ${err.message}`),
    );

    // Cache the breakdown
    const cacheKey = CACHE_KEYS.leadScore(tenantId, leadId);
    await this.redis.set(cacheKey, breakdown, CACHE_TTL.LEAD_SCORE);

    return breakdown;
  }
}
