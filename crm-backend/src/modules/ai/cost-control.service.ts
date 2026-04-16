/**
 * AiCostControlService
 *
 * Enforces per-tenant monthly token quotas for AI features.
 * Quotas are stored and incremented in Redis with a TTL that expires at
 * the start of the next calendar month (rolling monthly window).
 *
 * Tier limits (tokens/month):
 *   free        →  10 000   (~$0.10 at GPT-4o blended pricing)
 *   starter     → 100 000   (~$1.00)
 *   pro         → 500 000   (~$5.00)
 *   enterprise  → unlimited
 *
 * Usage:
 *   await this.costControl.assertQuota(tenantId, tenantTier, estimatedTokens);
 *   // ... call OpenAI ...
 *   await this.costControl.recordUsage(tenantId, completion.usage.total_tokens);
 *
 * assertQuota throws TooManyRequestsException when the monthly budget is exceeded.
 * recordUsage is fire-and-forget safe (never throws).
 */

import { Injectable, Logger } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import { RedisService } from '../../core/cache/redis.service';

export type AiTier = 'free' | 'starter' | 'pro' | 'enterprise';

const TIER_MONTHLY_LIMITS: Record<AiTier, number> = {
  free:       10_000,
  starter:   100_000,
  pro:       500_000,
  enterprise: Infinity,
};

// GPT-4o blended pricing estimate: ~$10 per 1M tokens
const COST_PER_TOKEN_USD = 10 / 1_000_000;

@Injectable()
export class AiCostControlService {
  private readonly logger = new Logger(AiCostControlService.name);

  constructor(private readonly redis: RedisService) {}

  /**
   * Assert that the tenant has remaining AI quota for this month.
   * Throws 429 if the budget is exhausted.
   *
   * @param estimatedTokens - Conservative estimate of tokens this request will use.
   *   Use 1000 as a safe default when the exact count is unknown upfront.
   */
  async assertQuota(tenantId: string, tier: AiTier, estimatedTokens = 1000): Promise<void> {
    const limit = TIER_MONTHLY_LIMITS[tier] ?? TIER_MONTHLY_LIMITS.free;
    if (limit === Infinity) return; // enterprise: no quota enforcement

    const key = this.usageKey(tenantId);
    const rawUsed = await this.redis.client.get(key);
    const used = parseInt(rawUsed ?? '0', 10);

    if (used + estimatedTokens > limit) {
      const estimatedCostUsd = (used * COST_PER_TOKEN_USD).toFixed(4);
      this.logger.warn(
        `AI quota exceeded: tenant=${tenantId} tier=${tier} ` +
        `used=${used} limit=${limit} (~$${estimatedCostUsd} spent this month)`,
      );
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'AI quota exceeded',
          message: `Monthly AI token budget exhausted (${used.toLocaleString()}/${limit.toLocaleString()} tokens used). Upgrade your plan or wait until next month.`,
          meta: {
            tier,
            tokensUsed: used,
            tokensLimit: limit,
            resetsAt: this.getMonthResetIso(),
          },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * Record actual token usage after a successful AI call.
   * Fire-and-forget safe: errors are logged, never thrown.
   */
  async recordUsage(tenantId: string, tokensUsed: number): Promise<void> {
    if (tokensUsed <= 0) return;

    const key = this.usageKey(tenantId);

    try {
      const pipeline = this.redis.client.pipeline();
      pipeline.incrby(key, tokensUsed);
      // Expire at the start of next month — sliding monthly window
      pipeline.expireat(key, this.nextMonthTimestamp());
      await pipeline.exec();
    } catch (err) {
      // Usage tracking failure must never surface to the caller
      this.logger.error(
        `AI usage record failed for tenant ${tenantId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Read current month usage without asserting quota.
   * Used by the billing module and admin dashboard.
   */
  async getMonthlyUsage(tenantId: string): Promise<{
    tokensUsed: number;
    estimatedCostUsd: number;
    resetsAt: string;
  }> {
    const key = this.usageKey(tenantId);
    const rawUsed = await this.redis.client.get(key);
    const tokensUsed = parseInt(rawUsed ?? '0', 10);

    return {
      tokensUsed,
      estimatedCostUsd: parseFloat((tokensUsed * COST_PER_TOKEN_USD).toFixed(4)),
      resetsAt: this.getMonthResetIso(),
    };
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  private usageKey(tenantId: string): string {
    const d = new Date();
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return `ai:tokens:${tenantId}:${month}`;
  }

  private nextMonthTimestamp(): number {
    const d = new Date();
    return Math.floor(
      new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0).getTime() / 1000,
    );
  }

  private getMonthResetIso(): string {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString();
  }
}
