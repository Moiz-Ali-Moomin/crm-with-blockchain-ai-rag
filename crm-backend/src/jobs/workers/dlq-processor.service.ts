/**
 * DlqProcessorService — Dead-Letter Queue sweep
 *
 * Runs every 5 minutes via @Cron and inspects the failed job stores of all
 * critical queues. BullMQ does not have a native "DLQ" — failed jobs are
 * kept in the failed set based on removeOnFail settings. This service acts
 * as the DLQ consumer.
 *
 * Behaviour per failed job:
 *   - Age < 7 days AND retry budget remaining  → retry immediately
 *   - Age >= 7 days                            → archive to logger + remove
 *   - Retry budget exhausted                   → alert (logger.error triggers
 *     Loki alert in production Grafana stack)
 *
 * Critical queues (financial + blockchain) are processed on every run.
 * Non-critical queues (email, sms) are checked but alerts are downgraded to WARN.
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { Cron, CronExpression } from '@nestjs/schedule';
import { QUEUE_NAMES } from '../../core/queue/queue.constants';

interface QueueConfig {
  queue: Queue;
  critical: boolean;
}

const ARCHIVE_AGE_DAYS = 7;
const SWEEP_BATCH_SIZE = 100;

@Injectable()
export class DlqProcessorService {
  private readonly logger = new Logger(DlqProcessorService.name);

  private readonly queues: QueueConfig[];

  constructor(
    @InjectQueue(QUEUE_NAMES.PAYMENT_PROCESSING)
    paymentQueue: Queue,
    @InjectQueue(QUEUE_NAMES.BLOCKCHAIN)
    blockchainQueue: Queue,
    @InjectQueue(QUEUE_NAMES.BLOCKCHAIN_EVENTS)
    blockchainEventsQueue: Queue,
    @InjectQueue(QUEUE_NAMES.TRANSACTION_CONFIRMATION)
    txConfirmationQueue: Queue,
    @InjectQueue(QUEUE_NAMES.EMAIL)
    emailQueue: Queue,
    @InjectQueue(QUEUE_NAMES.AUTOMATION)
    automationQueue: Queue,
    @InjectQueue(QUEUE_NAMES.WEBHOOK_OUTBOUND)
    webhookQueue: Queue,
  ) {
    this.queues = [
      { queue: paymentQueue,         critical: true  },
      { queue: blockchainQueue,       critical: true  },
      { queue: blockchainEventsQueue, critical: true  },
      { queue: txConfirmationQueue,   critical: true  },
      { queue: emailQueue,            critical: false },
      { queue: automationQueue,       critical: false },
      { queue: webhookQueue,          critical: false },
    ];
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async sweepFailedJobs(): Promise<void> {
    for (const { queue, critical } of this.queues) {
      try {
        await this.processQueueDlq(queue, critical);
      } catch (err) {
        this.logger.error(
          `DLQ sweep failed for queue [${queue.name}]: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  private async processQueueDlq(queue: Queue, critical: boolean): Promise<void> {
    const failed = await queue.getFailed(0, SWEEP_BATCH_SIZE - 1);

    if (failed.length === 0) return;

    this.logger.log(`DLQ sweep: ${failed.length} failed jobs in queue [${queue.name}]`);

    for (const job of failed) {
      await this.handleFailedJob(job, queue.name, critical);
    }
  }

  private async handleFailedJob(
    job: Job,
    queueName: string,
    critical: boolean,
  ): Promise<void> {
    const ageMs = Date.now() - (job.timestamp ?? 0);
    const ageDays = ageMs / 86_400_000;
    const maxAttempts = job.opts.attempts ?? 3;
    const attemptsExhausted = job.attemptsMade >= maxAttempts;

    if (ageDays >= ARCHIVE_AGE_DAYS) {
      // Archive for post-mortem and remove
      this.archiveJob(job, queueName);
      try {
        await job.remove();
      } catch {
        // Removal is best-effort
      }
      return;
    }

    if (!attemptsExhausted) {
      // Still has retry budget — re-enqueue with a delay
      try {
        await job.retry();
        this.logger.warn(
          `DLQ: Retried job [${job.id}] in [${queueName}] ` +
          `(attempt ${job.attemptsMade + 1}/${maxAttempts})`,
        );
      } catch (retryErr) {
        this.logger.error(
          `DLQ: Failed to retry job [${job.id}] in [${queueName}]: ${retryErr}`,
        );
      }
      return;
    }

    // Retry budget exhausted — alert at appropriate severity
    const alertMsg =
      `DLQ: Job [${job.id}] in [${queueName}] permanently failed after ` +
      `${job.attemptsMade} attempts. Reason: ${job.failedReason ?? 'unknown'}`;

    if (critical) {
      // In production: this logger.error line triggers Loki → Grafana alert → PagerDuty
      this.logger.error(alertMsg, {
        queueName,
        jobId: job.id,
        jobName: job.name,
        attemptsMade: job.attemptsMade,
        failedReason: job.failedReason,
        // Truncate payload to avoid flooding logs with large objects
        jobDataSample: JSON.stringify(job.data).slice(0, 500),
      });
    } else {
      this.logger.warn(alertMsg);
    }
  }

  private archiveJob(job: Job, queueName: string): void {
    // In production this should write to MongoDB dlq_archive collection.
    // Using logger here so the structured log is captured by Loki for querying.
    this.logger.warn(`DLQ archive: removing aged-out job`, {
      queueName,
      jobId: job.id,
      jobName: job.name,
      ageHours: Math.round((Date.now() - (job.timestamp ?? 0)) / 3_600_000),
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
      jobDataSample: JSON.stringify(job.data).slice(0, 500),
    });
  }
}
