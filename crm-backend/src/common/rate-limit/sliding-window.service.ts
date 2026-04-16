/**
 * SlidingWindowRateLimiter
 *
 * Implements a sliding-window algorithm using a Redis sorted set (ZSET).
 * Atomic via a Lua script — safe under concurrent requests across multiple pods.
 *
 * Why sliding window over the default ThrottlerModule fixed window:
 *   Fixed windows allow boundary bursts: a client can send `limit` requests
 *   at 00:59:59 and another `limit` at 01:00:01 — 2× the limit in 2 seconds.
 *   A sliding window prevents this by looking back exactly `windowMs` from now.
 *
 * Used by TenantThrottlerGuard as an additional per-tenant layer on top of
 * NestJS's built-in IP-based throttler.
 */

import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../core/cache/redis.service';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number; // ms until the oldest entry expires
  limit: number;
}

// Atomic Lua script: remove stale entries, count current, conditionally add new entry
const SLIDING_WINDOW_SCRIPT = `
local key          = KEYS[1]
local now          = tonumber(ARGV[1])
local window_start = tonumber(ARGV[2])
local limit        = tonumber(ARGV[3])
local ttl_seconds  = tonumber(ARGV[4])

-- Remove entries outside the window
redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)

-- Count requests in current window
local count = redis.call('ZCARD', key)

if count < limit then
  -- Add current request (score=now, member=now+random suffix for uniqueness)
  local member = tostring(now) .. ':' .. tostring(math.random(1, 1000000))
  redis.call('ZADD', key, now, member)
  redis.call('EXPIRE', key, ttl_seconds)
  return {1, limit - count - 1}
else
  return {0, 0}
end
`;

@Injectable()
export class SlidingWindowRateLimiter {
  private readonly logger = new Logger(SlidingWindowRateLimiter.name);

  constructor(private readonly redis: RedisService) {}

  async check(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - windowMs;
    const ttlSeconds = Math.ceil(windowMs / 1000) + 1;

    let result: [number, number];

    try {
      result = (await this.redis.client.eval(
        SLIDING_WINDOW_SCRIPT,
        1,
        key,
        String(now),
        String(windowStart),
        String(limit),
        String(ttlSeconds),
      )) as [number, number];
    } catch (err) {
      // Redis failure → fail open (allow the request) to avoid cascading outage
      this.logger.error(`SlidingWindowRateLimiter Redis error: ${err instanceof Error ? err.message : String(err)}`);
      return { allowed: true, remaining: limit, resetMs: windowMs, limit };
    }

    const [allowed, remaining] = result;

    return {
      allowed: allowed === 1,
      remaining,
      resetMs: windowMs,
      limit,
    };
  }
}
