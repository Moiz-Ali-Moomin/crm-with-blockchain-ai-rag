/**
 * CircuitBreakerService
 *
 * Implements the circuit-breaker pattern on top of Redis so the state is
 * shared across all NestJS instances (works in multi-pod deployments).
 *
 * States:
 *   CLOSED   — normal operation; failures are counted
 *   OPEN     — fast-fail; requests are rejected without calling the provider
 *   HALF_OPEN — probe state; one request is allowed through to test recovery
 *
 * Configuration is per-circuit-name. Add a new entry to CIRCUIT_CONFIGS to
 * protect additional external providers.
 *
 * Usage:
 *   const result = await this.circuitBreaker.execute('openai', () =>
 *     this.openai.chat.completions.create({ ... })
 *   );
 */

import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { RedisService } from '../cache/redis.service';

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitConfig {
  /** Number of failures within the window before the circuit opens */
  failureThreshold: number;
  /** Seconds the failure window spans (ZSET TTL) */
  windowSeconds: number;
  /** Milliseconds to stay OPEN before probing */
  openDurationMs: number;
}

interface CircuitRecord {
  state: CircuitState;
  openedAt: number;
}

const CIRCUIT_CONFIGS: Record<string, CircuitConfig> = {
  openai: {
    failureThreshold: 5,
    windowSeconds: 60,
    openDurationMs: 30_000,
  },
  polygon: {
    failureThreshold: 3,
    windowSeconds: 60,
    openDurationMs: 60_000,
  },
  sendgrid: {
    failureThreshold: 5,
    windowSeconds: 60,
    openDurationMs: 15_000,
  },
  twilio: {
    failureThreshold: 5,
    windowSeconds: 60,
    openDurationMs: 15_000,
  },
} as const;

export type CircuitName = keyof typeof CIRCUIT_CONFIGS;

@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);

  constructor(private readonly redis: RedisService) {}

  /**
   * Execute fn through the circuit breaker for the named circuit.
   * Throws ServiceUnavailableException if the circuit is OPEN.
   * Propagates any error thrown by fn after recording it as a failure.
   */
  async execute<T>(circuitName: CircuitName, fn: () => Promise<T>): Promise<T> {
    const state = await this.getState(circuitName);

    if (state === 'OPEN') {
      this.logger.warn(`Circuit [${circuitName}] is OPEN — fast-failing request`);
      throw new ServiceUnavailableException(
        `Service ${circuitName} is temporarily unavailable. Please retry shortly.`,
      );
    }

    try {
      const result = await fn();
      await this.onSuccess(circuitName, state);
      return result;
    } catch (err) {
      await this.onFailure(circuitName);
      throw err;
    }
  }

  // ─── State Machine ───────────────────────────────────────────────────────────

  private async getState(name: CircuitName): Promise<CircuitState> {
    const record = await this.redis.get<CircuitRecord>(`circuit:state:${name}`);

    if (!record) return 'CLOSED';

    if (record.state === 'OPEN') {
      const cfg = CIRCUIT_CONFIGS[name];
      const elapsed = Date.now() - record.openedAt;

      if (elapsed > cfg.openDurationMs) {
        // Transition to HALF_OPEN so one probe request gets through
        await this.redis.set(
          `circuit:state:${name}`,
          { state: 'HALF_OPEN', openedAt: record.openedAt } satisfies CircuitRecord,
          Math.ceil(cfg.openDurationMs / 1000) * 2,
        );
        this.logger.log(`Circuit [${name}] → HALF_OPEN (probing)`);
        return 'HALF_OPEN';
      }
    }

    return record.state;
  }

  private async onSuccess(name: CircuitName, priorState: CircuitState): Promise<void> {
    if (priorState === 'HALF_OPEN') {
      // Probe succeeded — close the circuit
      await this.redis.del(`circuit:state:${name}`);
      await this.redis.del(`circuit:failures:${name}`);
      this.logger.log(`Circuit [${name}] → CLOSED (probe succeeded)`);
    }
  }

  private async onFailure(name: CircuitName): Promise<void> {
    const cfg = CIRCUIT_CONFIGS[name];
    const failKey = `circuit:failures:${name}`;

    // Sliding window: store each failure as a timestamped entry
    const now = Date.now();
    const windowStart = now - cfg.windowSeconds * 1000;

    // ZADD + ZREMRANGEBYSCORE + ZCARD in a pipeline for atomicity
    const pipeline = this.redis.client.pipeline();
    pipeline.zadd(failKey, now, `${now}:${Math.random()}`);
    pipeline.zremrangebyscore(failKey, '-inf', windowStart);
    pipeline.zcard(failKey);
    pipeline.expire(failKey, cfg.windowSeconds * 2);
    const results = await pipeline.exec();

    const failureCount = results?.[2]?.[1] as number ?? 0;

    if (failureCount >= cfg.failureThreshold) {
      const record: CircuitRecord = { state: 'OPEN', openedAt: Date.now() };
      await this.redis.set(
        `circuit:state:${name}`,
        record,
        Math.ceil(cfg.openDurationMs / 1000) * 3,
      );
      this.logger.error(
        `Circuit [${name}] → OPEN after ${failureCount} failures in ${cfg.windowSeconds}s window`,
      );
    } else {
      this.logger.warn(
        `Circuit [${name}]: failure recorded (${failureCount}/${cfg.failureThreshold})`,
      );
    }
  }
}
