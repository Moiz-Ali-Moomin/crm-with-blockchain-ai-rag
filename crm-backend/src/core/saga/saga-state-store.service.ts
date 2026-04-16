/**
 * SagaStateStore
 *
 * Durable (Redis-backed) state store for distributed Sagas.
 * Survives process restarts as long as Redis data is persistent (AOF/RDB).
 *
 * For financial sagas (DealWon → Payment → Blockchain), consider upgrading
 * to a Postgres-backed store (add a saga_state table) for ACID durability.
 * Redis is used here because it covers the 99% case with minimal overhead.
 *
 * TTLs:
 *   - Active sagas: 7 days (should complete in minutes, but long TTL guards
 *     against silent failures going undetected)
 *   - Failed sagas: 30 days (for post-mortem analysis)
 */

import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../cache/redis.service';

export type SagaStatus = 'RUNNING' | 'COMPLETED' | 'FAILED' | 'COMPENSATING' | 'COMPENSATED';

export interface SagaRecord {
  sagaId: string;
  type: string;
  status: SagaStatus;
  currentStep: string;
  context: Record<string, unknown>;
  startedAt: number;
  updatedAt: number;
  failedReason?: string;
}

const ACTIVE_TTL_SECONDS = 7 * 24 * 3600;   // 7 days
const FAILED_TTL_SECONDS = 30 * 24 * 3600;  // 30 days

@Injectable()
export class SagaStateStore {
  private readonly logger = new Logger(SagaStateStore.name);

  constructor(private readonly redis: RedisService) {}

  async start(
    sagaId: string,
    type: string,
    initialContext: Record<string, unknown>,
    firstStep: string,
  ): Promise<void> {
    const record: SagaRecord = {
      sagaId,
      type,
      status: 'RUNNING',
      currentStep: firstStep,
      context: initialContext,
      startedAt: Date.now(),
      updatedAt: Date.now(),
    };

    await this.redis.set(`saga:${sagaId}`, record, ACTIVE_TTL_SECONDS);
    this.logger.log(`Saga [${type}] started: ${sagaId} @ step=${firstStep}`);
  }

  async advance(
    sagaId: string,
    nextStep: string,
    contextPatch: Record<string, unknown> = {},
  ): Promise<void> {
    const existing = await this.get(sagaId);
    if (!existing) {
      this.logger.warn(`Saga advance called for unknown sagaId: ${sagaId}`);
      return;
    }

    const updated: SagaRecord = {
      ...existing,
      currentStep: nextStep,
      context: { ...existing.context, ...contextPatch },
      updatedAt: Date.now(),
    };

    await this.redis.set(`saga:${sagaId}`, updated, ACTIVE_TTL_SECONDS);
    this.logger.log(`Saga ${sagaId} → step=${nextStep}`);
  }

  async complete(sagaId: string): Promise<void> {
    const existing = await this.get(sagaId);
    if (!existing) return;

    const updated: SagaRecord = {
      ...existing,
      status: 'COMPLETED',
      currentStep: 'done',
      updatedAt: Date.now(),
    };

    // Keep completed sagas briefly for deduplication
    await this.redis.set(`saga:${sagaId}`, updated, 3600);
    this.logger.log(`Saga ${sagaId} COMPLETED`);
  }

  async fail(sagaId: string, reason: string): Promise<void> {
    const existing = await this.get(sagaId);
    if (!existing) return;

    const updated: SagaRecord = {
      ...existing,
      status: 'FAILED',
      failedReason: reason,
      updatedAt: Date.now(),
    };

    await this.redis.set(`saga:${sagaId}`, updated, FAILED_TTL_SECONDS);
    this.logger.error(`Saga ${sagaId} FAILED: ${reason}`);
  }

  async markCompensating(sagaId: string): Promise<void> {
    const existing = await this.get(sagaId);
    if (!existing) return;

    const updated: SagaRecord = {
      ...existing,
      status: 'COMPENSATING',
      updatedAt: Date.now(),
    };

    await this.redis.set(`saga:${sagaId}`, updated, FAILED_TTL_SECONDS);
  }

  async markCompensated(sagaId: string): Promise<void> {
    const existing = await this.get(sagaId);
    if (!existing) return;

    const updated: SagaRecord = {
      ...existing,
      status: 'COMPENSATED',
      updatedAt: Date.now(),
    };

    await this.redis.set(`saga:${sagaId}`, updated, FAILED_TTL_SECONDS);
    this.logger.log(`Saga ${sagaId} COMPENSATED`);
  }

  async get(sagaId: string): Promise<SagaRecord | null> {
    return this.redis.get<SagaRecord>(`saga:${sagaId}`);
  }

  /** Returns true if the saga already exists (deduplication guard). */
  async exists(sagaId: string): Promise<boolean> {
    return this.redis.exists(`saga:${sagaId}`);
  }
}
