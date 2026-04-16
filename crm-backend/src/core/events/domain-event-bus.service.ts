/**
 * DomainEventBus
 *
 * Single publish point for all domain events in the system.
 *
 * On every publish():
 *   1. In-process EventEmitter2 fanout  → Saga listeners (synchronous, same process)
 *   2. BullMQ automation queue          → Automation engine reacts async
 *   3. BullMQ webhook queue             → Outbound webhook fanout async
 *
 * BullMQ jobId = eventId → deduplication: the same event published twice
 * produces only one job (BullMQ drops the duplicate when jobId already exists).
 *
 * correlationId is propagated through every downstream job so distributed
 * traces can be stitched together across queue boundaries.
 */

import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AnyDomainEvent, createDomainEvent } from '../../shared/events/domain-events';
import { QUEUE_NAMES, QUEUE_JOB_OPTIONS } from '../queue/queue.constants';

@Injectable()
export class DomainEventBus {
  private readonly logger = new Logger(DomainEventBus.name);

  constructor(
    private readonly emitter: EventEmitter2,
    @InjectQueue(QUEUE_NAMES.AUTOMATION)
    private readonly automationQueue: Queue,
    @InjectQueue(QUEUE_NAMES.WEBHOOK_OUTBOUND)
    private readonly webhookQueue: Queue,
  ) {}

  /**
   * Publish a domain event. In-process listeners fire first, then async queues.
   * Never throws — queue failures are logged but don't block the caller.
   */
  async publish<T extends AnyDomainEvent>(event: T): Promise<void> {
    // 1. In-process fanout (Saga handlers, metrics hooks)
    await this.emitter.emitAsync(event.eventType, event);

    const jobOpts = {
      jobId: `auto:${event.eventId}`,
      attempts: QUEUE_JOB_OPTIONS.automation.attempts,
      backoff: QUEUE_JOB_OPTIONS.automation.backoff,
      removeOnComplete: QUEUE_JOB_OPTIONS.automation.removeOnComplete,
      removeOnFail: QUEUE_JOB_OPTIONS.automation.removeOnFail,
    };

    const webhookOpts = {
      jobId: `webhook:${event.eventId}`,
      attempts: QUEUE_JOB_OPTIONS.webhook.attempts,
      backoff: QUEUE_JOB_OPTIONS.webhook.backoff,
      removeOnComplete: QUEUE_JOB_OPTIONS.webhook.removeOnComplete,
      removeOnFail: QUEUE_JOB_OPTIONS.webhook.removeOnFail,
    };

    // 2. Async queue fanout (best-effort — never fail the caller)
    await Promise.allSettled([
      this.automationQueue.add('process_domain_event', event, jobOpts),
      this.webhookQueue.add('fanout_domain_event', event, webhookOpts),
    ]).then((results) => {
      for (const r of results) {
        if (r.status === 'rejected') {
          this.logger.error(
            `DomainEventBus queue fanout failed for event ${event.eventId} (${event.eventType}): ${r.reason}`,
          );
        }
      }
    });
  }

  /** Convenience factory — ensures eventId and occurredAt are always set. */
  create<T extends AnyDomainEvent>(partial: Omit<T, 'eventId' | 'occurredAt'>): T {
    return createDomainEvent(partial);
  }
}
