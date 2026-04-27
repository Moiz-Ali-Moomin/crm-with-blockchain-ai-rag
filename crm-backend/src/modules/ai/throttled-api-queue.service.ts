/**
 * ThrottledApiQueue
 *
 * A process-wide singleton that funnels every outbound AI API call
 * (embeddings + LLM) through a single sequential promise chain.
 *
 * Why a sequential queue instead of a semaphore?
 *   A semaphore still allows N simultaneous calls. With rate-limited APIs
 *   (Anthropic, OpenAI) the burst window is 1 second — even 2 concurrent
 *   calls can trigger 429 when each request itself takes <1 s.
 *   A queue with a minimum inter-call gap of 300 ms is the simplest
 *   guarantee that no two calls overlap.
 *
 * Guarantees (per process):
 *   1. Only one API call executes at a time.
 *   2. Minimum 300 ms gap between the end of one call and the start of next.
 *   3. Identical in-flight calls (same cache key) share one promise — no
 *      duplicate network requests for the same embedding/query.
 *   4. On HTTP 429: exponential back-off 1 s → 2 s → 4 s, max 3 retries.
 *   5. In-memory LRU-style caches for embeddings (500 entries) and LLM
 *      responses (200 entries) provide sub-millisecond hits for hot queries.
 *   6. Every call, gap, and retry is logged with a wall-clock timestamp.
 */

import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'crypto';

// ── Constants ────────────────────────────────────────────────────────────────

const MIN_GAP_MS          = 300;
const RETRY_DELAYS_MS     = [1_000, 2_000, 4_000] as const; // 429 back-off schedule
const EMBEDDING_CACHE_MAX = 500;
const LLM_CACHE_MAX       = 200;
// Hard cap on items waiting + executing in the chain. Each AI call can take
// 20-60 s; 10 items × 60 s = 10 minutes max backlog — reject beyond this to
// prevent unbounded queue growth and cascading 429s. Callers receive 503 and
// show a "service busy" message without retrying.
const MAX_QUEUE_DEPTH     = 10;

// ── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let _uid = 0;
function uniqueKey(): string {
  return `unique:${++_uid}:${Date.now()}`;
}

/**
 * Detect rate-limit errors from Anthropic SDK, OpenAI SDK, Axios, and plain
 * Error objects. Checks both numeric status codes and message strings.
 */
function is429(err: unknown): boolean {
  if (err == null) return false;
  const e = err as Record<string, unknown>;
  if (e['status'] === 429 || e['statusCode'] === 429) return true;
  const msg = typeof e['message'] === 'string' ? (e['message'] as string).toLowerCase() : '';
  return msg.includes('429') || msg.includes('rate limit') || msg.includes('too many requests');
}

/** Evict the oldest entry when the map exceeds its capacity. */
function evictIfFull<K, V>(map: Map<K, V>, max: number): void {
  if (map.size >= max) {
    // Map iteration order is insertion order — first key is oldest.
    const oldest = map.keys().next().value as K;
    map.delete(oldest);
  }
}

// ────────────────────────────────────────────────────────────────────────────

@Injectable()
export class ThrottledApiQueue {
  private readonly logger = new Logger(ThrottledApiQueue.name);

  // The tail of the sequential chain. Every new call appends to this.
  private tail: Promise<void> = Promise.resolve();

  // Wall-clock time of the last completed API call (used for gap enforcement).
  private lastCallAt = 0;

  // In-flight deduplication: key → shared promise for concurrent identical calls.
  private readonly inFlight = new Map<string, Promise<unknown>>();

  // Count of items currently waiting or executing in the sequential chain.
  // Incremented when an item joins the chain; decremented in finally so it
  // always tracks correctly regardless of success or failure.
  private queueDepth = 0;

  // L1 in-memory caches (faster than Redis, lives for the process lifetime).
  private readonly embeddingCache = new Map<string, number[]>();
  private readonly llmCache       = new Map<string, string>();

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * embed()
   *
   * Execute an embedding API call with:
   *   - In-memory cache keyed on SHA-256(text)
   *   - In-flight dedup (concurrent identical texts share one call)
   *   - Sequential queuing + 300 ms gap
   *   - 429 retry with exponential back-off
   *   - Optional AbortSignal: if the caller's HTTP request closes before this
   *     item reaches the front of the queue, execution is skipped entirely.
   */
  async embed(text: string, fn: () => Promise<number[]>, signal?: AbortSignal): Promise<number[]> {
    const key = createHash('sha256').update(text).digest('hex').slice(0, 24);

    const cached = this.embeddingCache.get(key);
    if (cached) {
      this.logger.debug(`[embed] cache-hit key=${key}`);
      return cached;
    }

    const result = await this.schedule<number[]>(`embed:${key}`, fn, signal);

    evictIfFull(this.embeddingCache, EMBEDDING_CACHE_MAX);
    this.embeddingCache.set(key, result);
    return result;
  }

  /**
   * agentLlm<T>()
   *
   * Route any agent LLM call (generateWithTools or generate) through the
   * sequential queue. Provides identical guarantees to llm(): one call at a
   * time, 300 ms gap, 429 retry with back-off, queue depth cap.
   *
   * Not cached — agent turns are always unique (messages array changes every
   * iteration). Use the signal to abort queued calls when the HTTP client
   * disconnects.
   */
  async agentLlm<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    return this.schedule<T>(uniqueKey(), fn, signal);
  }

  /**
   * llm()
   *
   * Execute an LLM API call with:
   *   - Optional in-memory cache (pass cacheKey to enable; omit for unique calls)
   *   - Sequential queuing + 300 ms gap
   *   - 429 retry with exponential back-off
   *   - Optional AbortSignal: skips execution if caller disconnected while queued
   *
   * Pass cacheKey for stateless queries (no conversation history) so identical
   * questions hitting the queue in the same process lifetime return instantly.
   * Omit cacheKey for conversational turns — they are always unique.
   */
  async llm(fn: () => Promise<string>, cacheKey?: string, signal?: AbortSignal): Promise<string> {
    if (cacheKey) {
      const cached = this.llmCache.get(cacheKey);
      if (cached) {
        this.logger.debug(`[llm] cache-hit key=${cacheKey.slice(0, 24)}`);
        return cached;
      }

      const result = await this.schedule<string>(`llm:${cacheKey}`, fn, signal);

      evictIfFull(this.llmCache, LLM_CACHE_MAX);
      this.llmCache.set(cacheKey, result);
      return result;
    }

    // No cacheKey → still sequential + retry, but no cache / in-flight dedup.
    return this.schedule<string>(uniqueKey(), fn, signal);
  }

  // ── Core scheduling ────────────────────────────────────────────────────────

  private schedule<T>(key: string, fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    // Return the existing promise if an identical call is already in flight.
    // Deduped calls do not count toward queue depth — they share one slot.
    const existing = this.inFlight.get(key) as Promise<T> | undefined;
    if (existing) {
      this.logger.debug(`[queue] dedup in-flight key=${key.slice(0, 28)}`);
      return existing;
    }

    // Reject early if already aborted before even joining the queue.
    if (signal?.aborted) {
      return Promise.reject(Object.assign(new Error('Request aborted before queuing'), { name: 'AbortError' }));
    }

    // Reject early if the queue is already at capacity. This prevents unbounded
    // backlog build-up when AI calls are slow (20-60 s each). The 503 surfaces
    // to the frontend which shows a "service busy" message without retrying.
    if (this.queueDepth >= MAX_QUEUE_DEPTH) {
      this.logger.warn(
        `[queue] OVERLOADED depth=${this.queueDepth}/${MAX_QUEUE_DEPTH} — rejecting key=${key.slice(0, 28)}`,
      );
      throw new ServiceUnavailableException(
        'AI service is currently busy. Please try again in a moment.',
      );
    }

    this.queueDepth++;

    const promise = this.tail.then(async (): Promise<T> => {
      // Check if the client disconnected while this item was waiting in queue.
      // Skipping here saves the full 20-60 s AI call for a request nobody will read.
      if (signal?.aborted) {
        const label = key.slice(0, 28);
        this.logger.log(`[queue] SKIP (client aborted) key=${label}`);
        throw Object.assign(new Error('Request aborted while queued'), { name: 'AbortError' });
      }

      await this.enforceGap();

      const label = key.slice(0, 28);
      this.logger.log(
        `[queue] ${new Date().toISOString()} → start key=${label} depth=${this.queueDepth}`,
      );
      const t0 = Date.now();

      const result = await this.withRetry(key, fn);

      const elapsed = Date.now() - t0;
      this.lastCallAt = Date.now();
      this.logger.log(`[queue] ← done  key=${label} elapsed=${elapsed}ms`);

      return result;
    });

    // Keep the chain alive even when individual calls reject.
    this.tail = promise.then(
      () => {},
      () => {},
    );

    this.inFlight.set(key, promise as Promise<unknown>);
    // Clean up in-flight entry and queue depth counter after settle.
    // Using finally guarantees the decrement happens on both success and error.
    void promise.finally(() => {
      this.inFlight.delete(key);
      this.queueDepth--;
    });

    return promise;
  }

  // ── Gap enforcement ────────────────────────────────────────────────────────

  private async enforceGap(): Promise<void> {
    const elapsed = Date.now() - this.lastCallAt;
    if (elapsed < MIN_GAP_MS) {
      const wait = MIN_GAP_MS - elapsed;
      this.logger.debug(`[queue] gap: waiting ${wait}ms before next call`);
      await sleep(wait);
    }
  }

  // ── 429 retry ─────────────────────────────────────────────────────────────

  private async withRetry<T>(key: string, fn: () => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        return await fn();
      } catch (err) {
        if (is429(err) && attempt < RETRY_DELAYS_MS.length) {
          const delay = RETRY_DELAYS_MS[attempt];
          this.logger.warn(
            `[queue] 429 on key=${key.slice(0, 28)} → retry ${attempt + 1}/${RETRY_DELAYS_MS.length} in ${delay}ms`,
          );
          await sleep(delay);
          // lastCallAt advances so the next call (this retry) still enforces the gap.
          this.lastCallAt = Date.now();
        } else {
          throw err;
        }
      }
    }
    // TypeScript requires an explicit unreachable throw.
    throw new Error(`[ThrottledApiQueue] max retries exceeded for key=${key}`);
  }
}
