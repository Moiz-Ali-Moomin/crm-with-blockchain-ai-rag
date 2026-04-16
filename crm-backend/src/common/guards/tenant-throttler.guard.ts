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

const TIER_LIMITS: Record<TenantTier, { rpm: number }> = {
  free:       { rpm: 30    },
  starter:    { rpm: 100   },
  pro:        { rpm: 500   },
  enterprise: { rpm: 2_000 },
};

@Injectable()
export class TenantThrottlerGuard extends ThrottlerGuard {
  constructor(
    @Inject('THROTTLER:MODULE_OPTIONS') options: any,
    @Inject('THROTTLER_STORAGE') storage: any,
    reflector: Reflector,
    private readonly slidingWindow: SlidingWindowRateLimiter,
  ) {
    super(options, storage, reflector);
  }

  protected async getTracker(req: Request): Promise<string> {
    const tenantId = (req as any).user?.tenantId as string | undefined;
    if (tenantId) return `tenant:${tenantId}`;
    return (
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
      req.ip ??
      'unknown'
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const baseAllowed = await super.canActivate(context);
    if (!baseAllowed) return false;

    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const user = (req as any).user as { tenantId?: string; tier?: TenantTier } | undefined;

    if (!user?.tenantId) return true;

    const tier = user.tier ?? 'free';
    const { rpm } = TIER_LIMITS[tier] ?? TIER_LIMITS.free;

    const result = await this.slidingWindow.check(
      `swrl:tenant:${user.tenantId}:rpm`,
      rpm,
      60_000,
    );

    if (!result.allowed) {
      res.setHeader('X-RateLimit-Limit', rpm);
      res.setHeader('X-RateLimit-Remaining', 0);
      res.setHeader('X-RateLimit-Reset', Math.ceil(Date.now() / 1000) + 60);
      res.setHeader('Retry-After', '60');

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: `Rate limit exceeded for tier [${tier}]: ${rpm} req/min.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    res.setHeader('X-RateLimit-Limit', rpm);
    res.setHeader('X-RateLimit-Remaining', result.remaining);

    return true;
  }
}
