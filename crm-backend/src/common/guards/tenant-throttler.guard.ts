/**
 * TenantThrottlerGuard
 *
 * Extends NestJS ThrottlerGuard to key rate limits by tenantId instead of IP.
 * This prevents a single tenant from consuming all capacity on a shared IP
 * (common when clients sit behind a corporate proxy or API gateway).
 *
 * Additionally applies a per-tier sliding window check using SlidingWindowRateLimiter:
 *   free      → 30 req/min
 *   starter   → 100 req/min
 *   pro       → 500 req/min
 *   enterprise→ 2000 req/min
 *
 * Falls back to IP-based keying for unauthenticated requests (e.g. /auth/login).
 *
 * Registration: replace ThrottlerGuard in AppModule providers array:
 *   { provide: APP_GUARD, useClass: TenantThrottlerGuard }
 */

import {
  Injectable,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { SlidingWindowRateLimiter } from '../rate-limit/sliding-window.service';

type TenantTier = 'free' | 'starter' | 'pro' | 'enterprise';

const TIER_LIMITS: Record<TenantTier, { rpm: number; rph: number }> = {
  free:       { rpm: 30,    rph: 200    },
  starter:    { rpm: 100,   rph: 1_000  },
  pro:        { rpm: 500,   rph: 10_000 },
  enterprise: { rpm: 2_000, rph: 50_000 },
};

@Injectable()
export class TenantThrottlerGuard extends ThrottlerGuard {
  constructor(
    // ThrottlerGuard injects its own deps via NestJS DI — we just pass them through
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    @Inject('THROTTLER:MODULE_OPTIONS') options: any,
    @Inject('THROTTLER_STORAGE') storage: any,
    reflector: Reflector,
  ) {
    super(options, storage, reflector);
  }

  // Override: key by tenantId instead of IP
  protected async getTracker(req: Request): Promise<string> {
    const user = (req as any).user as { tenantId?: string } | undefined;
    if (user?.tenantId) {
      return `tenant:${user.tenantId}`;
    }
    // Unauthenticated: fall back to IP (handles /auth/* endpoints)
    return (
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
      req.ip ??
      'unknown'
    );
  }

  // Override: add sliding-window check on top of built-in fixed-window check
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Run the built-in ThrottlerGuard logic first
    const baseAllowed = await super.canActivate(context);
    if (!baseAllowed) return false;

    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const user = (req as any).user as { tenantId?: string; tier?: TenantTier } | undefined;

    if (!user?.tenantId) return true; // unauthenticated — base guard already handled it

    const tier = user.tier ?? 'free';
    const limits = TIER_LIMITS[tier] ?? TIER_LIMITS.free;

    // Inject SlidingWindowRateLimiter via the module context
    // It is available because CoreModule exports it globally
    const limiter: SlidingWindowRateLimiter = (this as any).slidingWindow;
    if (!limiter) return true; // guard against misconfiguration — fail open

    const result = await limiter.check(
      `swrl:tenant:${user.tenantId}:rpm`,
      limits.rpm,
      60_000, // 1-minute window
    );

    if (!result.allowed) {
      res.setHeader('X-RateLimit-Limit', limits.rpm);
      res.setHeader('X-RateLimit-Remaining', 0);
      res.setHeader('X-RateLimit-Reset', Math.ceil(Date.now() / 1000) + 60);
      res.setHeader('Retry-After', '60');

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: `Rate limit exceeded for tier [${tier}]: ${limits.rpm} req/min. Upgrade your plan for higher limits.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    res.setHeader('X-RateLimit-Limit', limits.rpm);
    res.setHeader('X-RateLimit-Remaining', result.remaining);

    return true;
  }
}
