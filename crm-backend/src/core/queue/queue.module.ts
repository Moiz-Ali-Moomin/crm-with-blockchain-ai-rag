/**
 * BullMQ Queue Module
 * Registers all queues with Redis connection.
 * Workers are registered separately in JobsModule to avoid circular deps.
 */

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { QUEUE_NAMES } from './queue.constants';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.get<string>('REDIS_URL', 'redis://localhost:6379'),
          maxRetriesPerRequest: null, // Required by BullMQ
          enableReadyCheck: false,
        },
        defaultJobOptions: {
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 500 },
        },
      }),
    }),

    // Register each queue individually for type safety
    BullModule.registerQueue({ name: QUEUE_NAMES.EMAIL }),
    BullModule.registerQueue({ name: QUEUE_NAMES.SMS }),
    BullModule.registerQueue({ name: QUEUE_NAMES.WHATSAPP }),
    BullModule.registerQueue({ name: QUEUE_NAMES.NOTIFICATION }),
    BullModule.registerQueue({ name: QUEUE_NAMES.AUTOMATION }),
    BullModule.registerQueue({ name: QUEUE_NAMES.WEBHOOK_OUTBOUND }),
    BullModule.registerQueue({ name: QUEUE_NAMES.REPORT }),
    BullModule.registerQueue({ name: QUEUE_NAMES.TASK_REMINDER }),
    // ── Financial rail ───────────────────────────────────────────────────────
    BullModule.registerQueue({ name: QUEUE_NAMES.PAYMENT_PROCESSING }),
    BullModule.registerQueue({ name: QUEUE_NAMES.BLOCKCHAIN_EVENTS }),
    BullModule.registerQueue({ name: QUEUE_NAMES.TRANSACTION_CONFIRMATION }),
    BullModule.registerQueue({ name: QUEUE_NAMES.WITHDRAWALS }),
    BullModule.registerQueue({ name: QUEUE_NAMES.RECONCILIATION }),
    BullModule.registerQueue({ name: QUEUE_NAMES.DLQ }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
