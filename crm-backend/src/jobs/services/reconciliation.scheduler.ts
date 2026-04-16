import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '../../core/queue/queue.constants';
import type { ReconciliationJobPayload } from '../workers/reconciliation.worker';

@Injectable()
export class ReconciliationScheduler {
  private readonly logger = new Logger(ReconciliationScheduler.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.RECONCILIATION)
    private readonly reconciliationQueue: Queue,
  ) {}

  @Cron('*/2 * * * *')
  async scheduleReconciliation(): Promise<void> {
    const payload: ReconciliationJobPayload = {
      triggeredAt: new Date().toISOString(),
    };

    await this.reconciliationQueue.add('run_reconciliation', payload, {
      jobId:            'reconciliation:singleton',
      attempts:         1,
      removeOnComplete: true,
      removeOnFail:     false,
    });

    this.logger.debug('Reconciliation job scheduled');
  }
}
