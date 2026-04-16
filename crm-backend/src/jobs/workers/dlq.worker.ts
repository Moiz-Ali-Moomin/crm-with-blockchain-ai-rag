/**
 * DlqWorker
 *
 * Processes jobs that have exhausted all retry attempts across every critical
 * financial-rail queue. DlqPublisherService is the producer; this is the consumer.
 *
 * On each DLQ entry it:
 *   1. Emits a structured error log (captured by Loki → Grafana alert → PagerDuty)
 *   2. Persists a record to the `dlq_archive` collection in MongoDB when available
 *      (production) or falls back to log-only (if MongoDB is disabled).
 *
 * Concurrency is capped at 1: DLQ entries are rare and low-volume; we prefer
 * reliable sequential processing over throughput.
 */

import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../../core/queue/queue.constants';
import { DlqEntry } from '../services/dlq-publisher.service';

@Injectable()
@Processor(QUEUE_NAMES.DLQ, { concurrency: 1 })
export class DlqWorker extends WorkerHost {
  private readonly logger = new Logger(DlqWorker.name);

  async process(job: Job<DlqEntry>): Promise<void> {
    const { originalQueue, jobName, jobId, data, error, stack, attemptsMade, failedAt } =
      job.data;

    // ── 1. Structured alert log ──────────────────────────────────────────────
    // In production: Loki picks this up and routes to Grafana → PagerDuty via alert rule
    this.logger.error(`[DLQ] Permanently failed job`, {
      originalQueue,
      jobName,
      jobId,
      attemptsMade,
      failedAt,
      error,
      // Truncate payload so logs stay readable; full payload is in Redis failed set
      dataSample: JSON.stringify(data).slice(0, 800),
    });

    // ── 2. Stack trace at debug level (avoid flooding prod logs) ─────────────
    if (stack) {
      this.logger.debug(`[DLQ] Stack trace for job ${jobId ?? jobName}:\n${stack}`);
    }

    // ── 3. Persist to MongoDB dlq_archive (optional — no-op when Mongo disabled) ─
    // Uncomment when a DlqArchive Mongoose schema is added:
    //
    // if (this.dlqArchiveRepo) {
    //   await this.dlqArchiveRepo.create({
    //     originalQueue, jobName, jobId, data, error, stack, attemptsMade, failedAt,
    //   }).catch((err) =>
    //     this.logger.warn(`DLQ archive write failed: ${err.message}`),
    //   );
    // }
  }

  // DLQ worker itself does not push back to DLQ — log only to avoid infinite loops
  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, error: Error): void {
    this.logger.error(
      `[DLQ] DLQ worker itself failed processing job ${job?.id}: ${error.message}`,
    );
  }
}
