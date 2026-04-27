/**
 * AiExecutorService — THE single gate for every outbound LLM call.
 *
 * All LLM calls in this system MUST go through execute(). No exceptions.
 *
 * Guarantees (per-request AND cross-replica):
 *   1. acquireUserSlot()  — Redis NX lock: at most 1 concurrent AI request per
 *      user across ALL replicas. Acquired once at the HTTP request boundary in
 *      AiService; held for the full request lifetime; released in finally.
 *
 *   2. Global Redis semaphore — INCR/DECR with atomic Lua: at most
 *      GLOBAL_CONCURRENCY_LIMIT concurrent LLM calls across ALL replicas.
 *      503 when at capacity.
 *
 *   3. Per-process sequential chain — only one LLM call executes at a time
 *      within this process. 300 ms minimum gap between consecutive calls.
 *
 *   4. In-flight deduplication — identical key within the same process
 *      shares one promise (no duplicate network requests).
 *
 *   5. 429 retry — exponential back-off 1 s → 2 s, max 2 retries ONLY on 429.
 *      All other errors are re-thrown immediately.
 *
 *   6. Abort propagation — signal checked before queuing, after queuing wait,
 *      and on every retry cycle.
 *
 *   7. Backpressure — hard cap on in-process queue depth (MAX_QUEUE_DEPTH).
 *      Requests beyond the cap receive 503 immediately.
 */

import {
  Injectable,
  Logger,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { RedisService } from '../../core/cache/redis.service';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Maximum simultaneous LLM calls across ALL replicas (Redis semaphore). */
const GLOBAL_CONCURRENCY_LIMIT = 3;

/** Redis key for the global atomic counter. */
const GLOBAL_CONCURRENCY_KEY = 'ai:global:concurrency';

/** Auto-reset TTL for the global counter (safety net against crashes). */
const GLOBAL_CONCURRENCY_TTL_S = 300;

/** Per-user lock TTL — dead-man's switch if the request dies before finally. */
const USER_LOCK_TTL_S = 180;

/** Maximum items waiting + executing per process before rejecting with 503. */
const MAX_QUEUE_DEPTH = 10;

/** Minimum milliseconds between the end of one call and the start of the next. */
const MIN_GAP_MS = 300;

/** 429 back-off schedule — max 2 retries (indexes 0 and 1). */
const RETRY_DELAYS_MS = [1_000, 2_000] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

let _uid = 0;
/** Generate a unique key for non-idempotent (agent/conversational) calls. */
export function uniqueCallKey(): string {
  return `unique:${++_uid}:${Date.now()}`;
}

function is429(err: unknown): boolean {
  if (err == null) return false;
  const e = err as Record<string, unknown>;
  if (e['status'] === 429 || e['statusCode'] === 429) return true;
  const msg = typeof e['message'] === 'string' ? e['message'].toLowerCase() : '';
  return msg.includes('429') || msg.includes('rate limit') || msg.includes('too many requests');
}

// ── Lua script for atomic INCR-with-limit ─────────────────────────────────────
// Returns 1 if slot was acquired, 0 if the limit was already reached.
// Sets TTL on first increment only — surviving TTL resets the counter if this
// process crashes without calling DECR.
const ACQUIRE_SLOT_LUA = `
local val = redis.call('INCR', KEYS[1])
if val > tonumber(ARGV[1]) then
  redis.call('DECR', KEYS[1])
  return 0
end
if val == 1 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
end
return 1
`;

// ─────────────────────────────────────────────────────────────────────────────

export interface AiExecuteOptions<T> {
  /** Dedup key. Use uniqueCallKey() for non-idempotent (agent/conversational) calls. */
  key: string;
  /** The actual LLM call to run. */
  fn: () => Promise<T>;
  /** Propagated from the HTTP request — cancels queued + in-flight calls. */
  signal?: AbortSignal;
}

@Injectable()
export class AiExecutorService {
  private readonly logger = new Logger(AiExecutorService.name);

  // Per-process sequential chain — every new call appends to the tail.
  private tail: Promise<void> = Promise.resolve();
  private lastCallAt = 0;
  private queueDepth = 0;

  // In-flight dedup: key → shared promise for concurrent identical calls.
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(private readonly redis: RedisService) {}

  // ── Per-user request lock ─────────────────────────────────────────────────
  //
  // Acquire ONCE at the HTTP request boundary (AiService methods).
  // Hold for the full duration of the request; release in finally.
  //
  // Throws 429 if the user already has a concurrent request in progress.
  // Returns a release() function — always call in finally.

  async acquireUserSlot(userId: string): Promise<() => Promise<void>> {
    const lockKey = `ai:lock:user:${userId}`;
    const acquired = await this.redis.client.set(
      lockKey,
      '1',
      'EX',
      USER_LOCK_TTL_S,
      'NX',
    );

    if (!acquired) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message:
            'Another AI request is already in progress for your account. Please wait for it to complete.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return () => this.redis.del(lockKey);
  }

  // ── Central LLM executor ─────────────────────────────────────────────────
  //
  // Every outbound LLM call (generateWithTools, generate, planner.plan) MUST
  // pass through this method. The per-user slot (acquireUserSlot) must already
  // be held by the caller.

  async execute<T>(opts: AiExecuteOptions<T>): Promise<T> {
    const { key, fn, signal } = opts;

    // Fail fast — no point queuing if already aborted.
    if (signal?.aborted) {
      return Promise.reject(
        Object.assign(new Error('Request aborted before queuing'), { name: 'AbortError' }),
      );
    }

    // Return existing promise if an identical call is already in-flight.
    const existing = this.inFlight.get(key) as Promise<T> | undefined;
    if (existing) {
      this.logger.debug(`[executor] dedup in-flight key=${key.slice(0, 28)}`);
      return existing;
    }

    // Backpressure — reject immediately when the local queue is saturated.
    if (this.queueDepth >= MAX_QUEUE_DEPTH) {
      this.logger.warn(
        `[executor] OVERLOADED depth=${this.queueDepth}/${MAX_QUEUE_DEPTH} key=${key.slice(0, 28)}`,
      );
      throw new ServiceUnavailableException(
        'AI service is currently busy. Please try again in a moment.',
      );
    }

    this.queueDepth++;

    const promise = this.tail.then(async (): Promise<T> => {
      // Client disconnected while this item was waiting — skip the LLM call.
      if (signal?.aborted) {
        throw Object.assign(new Error('Request aborted while queued'), { name: 'AbortError' });
      }

      await this.enforceGap();

      // Acquire a global slot before calling the LLM. Returns false if the
      // global limit is reached across all replicas.
      const slotAcquired = await this.acquireGlobalSlot();
      if (!slotAcquired) {
        throw new ServiceUnavailableException(
          'AI service is at global capacity. Please try again shortly.',
        );
      }

      try {
        const label = key.slice(0, 28);
        this.logger.log(
          `[executor] ${new Date().toISOString()} → start key=${label} depth=${this.queueDepth}`,
        );
        const t0 = Date.now();

        const result = await this.withRetry(key, fn, signal);

        this.lastCallAt = Date.now();
        this.logger.log(`[executor] ← done key=${label} elapsed=${Date.now() - t0}ms`);
        return result;
      } finally {
        await this.releaseGlobalSlot();
      }
    });

    // Keep the chain alive regardless of individual call failures.
    this.tail = promise.then(
      () => {},
      () => {},
    );

    this.inFlight.set(key, promise as Promise<unknown>);
    // Decrement and clean up on both success and failure — never leaks.
    void promise.finally(() => {
      this.inFlight.delete(key);
      this.queueDepth--;
    });

    return promise;
  }

  // ── Gap enforcement ───────────────────────────────────────────────────────

  private async enforceGap(): Promise<void> {
    const elapsed = Date.now() - this.lastCallAt;
    if (elapsed < MIN_GAP_MS) {
      const wait = MIN_GAP_MS - elapsed;
      this.logger.debug(`[executor] gap: waiting ${wait}ms`);
      await sleep(wait);
    }
  }

  // ── Global Redis semaphore ────────────────────────────────────────────────

  private async acquireGlobalSlot(): Promise<boolean> {
    try {
      const result = await (this.redis.client as any).eval(
        ACQUIRE_SLOT_LUA,
        1,
        GLOBAL_CONCURRENCY_KEY,
        String(GLOBAL_CONCURRENCY_LIMIT),
        String(GLOBAL_CONCURRENCY_TTL_S),
      ) as number;
      if (result === 0) {
        this.logger.warn(
          `[executor] global semaphore full (limit=${GLOBAL_CONCURRENCY_LIMIT})`,
        );
        return false;
      }
      return true;
    } catch (err) {
      // Redis unavailable — degrade gracefully by allowing the call through.
      this.logger.error(`[executor] Redis semaphore acquire failed: ${(err as Error).message}`);
      return true;
    }
  }

  private async releaseGlobalSlot(): Promise<void> {
    try {
      const val = await this.redis.client.decr(GLOBAL_CONCURRENCY_KEY);
      // Guard against negative values from crashes or counter skew.
      if (val < 0) {
        await this.redis.client.set(GLOBAL_CONCURRENCY_KEY, '0');
      }
    } catch {
      // Non-fatal: counter auto-resets via TTL.
    }
  }

  // ── 429 retry ─────────────────────────────────────────────────────────────

  private async withRetry<T>(
    key: string,
    fn: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      if (signal?.aborted) {
        throw Object.assign(new Error('Request aborted during retry'), { name: 'AbortError' });
      }
      try {
        return await fn();
      } catch (err) {
        const isRetryable = is429(err) && attempt < RETRY_DELAYS_MS.length;
        if (!isRetryable) throw err;

        const delay = RETRY_DELAYS_MS[attempt];
        this.logger.warn(
          `[executor] 429 key=${key.slice(0, 28)} → retry ${attempt + 1}/${RETRY_DELAYS_MS.length} in ${delay}ms`,
        );
        await sleep(delay);
        this.lastCallAt = Date.now();
      }
    }
    // Unreachable — TypeScript requires explicit throw after the loop.
    throw new Error(`[AiExecutorService] max retries exceeded for key=${key}`);
  }
}
