/**
 * DlqPublisherService
 *
 * Single shared service that every critical worker calls from its
 * @OnWorkerEvent('failed') handler.
 *
 * Responsibility: when a job has exhausted ALL its retry attempts, push a
 * structured snapshot to the `dlq` queue so DlqWorker can log, alert, and
 * optionally persist it. Also increments the Prometheus DLQ counter so the
 * Grafana alert fires.
 *
 * Usage in any @Processor:
 *   @OnWorkerEvent('failed')
 *   async onFailed(job: Job | undefined, error: Error): Promise<void> {
 *     if (job) await this.dlqPublisher.publishIfExhausted(job, error, true);
 *   }
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { QUEUE_NAMES } from '../../core/queue/queue.constants';
import { BusinessMetricsService } from '../../core/metrics/business-metrics.service';

export interface DlqEntry {
  originalQueue: string;
  jobName: string;
  jobId: string | undefined;
  data: unknown;
  error: string;
  stack: string;
  attemptsMade: number;
  failedAt: string;
}

@Injectable()
export class DlqPublisherService {
  private readonly logger = new Logger(DlqPublisherService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.DLQ) private readonly dlqQueue: Queue,
    private readonly metrics: BusinessMetricsService,
  ) {}

  /**
   * Push to the DLQ only when the job has exhausted its full retry budget.
   * Idempotent: uses `dlq:<queue>:<jobId>` as the BullMQ jobId so duplicate
   * failure events (e.g. from reconnect) don't create duplicate DLQ entries.
   */
  async publishIfExhausted(
    job: Job,
    error: Error,
    critical = true,
  ): Promise<void> {
    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < maxAttempts) return; // still has retries — not our concern yet

    const entry: DlqEntry = {
      originalQueue: job.queueName,
      jobName:       job.name,
      jobId:         job.id,
      data:          job.data,
      error:         error.message,
      stack:         (error.stack ?? '').slice(0, 2_000),
      attemptsMade:  job.attemptsMade,
      failedAt:      new Date().toISOString(),
    };

    try {
      await this.dlqQueue.add('dlq_entry', entry, {
        // Dedup: if somehow the same exhausted job triggers this twice, only one lands
        jobId:           `dlq:${job.queueName}:${job.id ?? job.name}`,
        removeOnComplete: true,
        removeOnFail:    false,
      });

      this.metrics.recordDlqAlert(job.queueName, critical);

      this.logger.error(
        `[DLQ] Job exhausted — pushed to dlq queue`,
        {
          originalQueue: entry.originalQueue,
          jobName:       entry.jobName,
          jobId:         entry.jobId,
          attemptsMade:  entry.attemptsMade,
          error:         entry.error,
        },
      );
    } catch (publishErr) {
      // DLQ publish failing must never throw — log only
      this.logger.error(
        `[DLQ] Failed to publish exhausted job to dlq queue: ${(publishErr as Error).message}`,
        { originalQueue: job.queueName, jobId: job.id },
      );
    }
  }
}
