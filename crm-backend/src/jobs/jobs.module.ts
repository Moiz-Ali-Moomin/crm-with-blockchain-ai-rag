/**
 * Jobs Module - Registers all BullMQ workers
 * Workers are separate from the queue registration (in CoreModule/QueueModule)
 * because workers consume jobs while queues are used to produce jobs.
 */

/**
 * Jobs Module - Registers all BullMQ workers
 * Workers are separate from queue registration (in CoreModule/QueueModule)
 * because workers consume jobs while queues are used to produce jobs.
 */

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EmailWorker } from './workers/email.worker';
import { NotificationWorker } from './workers/notification.worker';
import { AutomationWorker } from './workers/automation.worker';
import { WebhookWorker } from './workers/webhook.worker';
import { SmsWorker } from './workers/sms.worker';
import { AiEmbeddingWorker } from './workers/ai-embedding.worker';
import { BlockchainWorker } from './workers/blockchain.worker';
// Financial rail
import { PaymentProcessingWorker } from './workers/payment-processing.worker';
import { BlockchainEventsWorker } from './workers/blockchain-events.worker';
import { TransactionConfirmationWorker } from './workers/transaction-confirmation.worker';
import { WithdrawalWorker } from './workers/withdrawal.worker';
import { ReconciliationWorker } from './workers/reconciliation.worker';
import { DlqWorker } from './workers/dlq.worker';
import { DlqPublisherService } from './services/dlq-publisher.service';
import { ReconciliationScheduler } from './services/reconciliation.scheduler';
import { AdminRetryController } from './controllers/admin-retry.controller';
import { AutomationModule } from '../modules/automation/automation.module';
import { AiModule } from '../modules/ai/ai.module';
import { BlockchainModule } from '../modules/blockchain/blockchain.module';
import { PaymentsModule } from '../modules/payments/payments.module';
import { WalletsModule } from '../modules/wallets/wallets.module';
import { DealsModule } from '../modules/deals/deals.module';
import { QUEUE_NAMES } from '../core/queue/queue.constants';
import { DealWonSaga } from '../modules/deals/sagas/deal-won.saga';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE_NAMES.EMAIL },
      { name: QUEUE_NAMES.NOTIFICATION },
      { name: QUEUE_NAMES.AUTOMATION },
      { name: QUEUE_NAMES.WEBHOOK_OUTBOUND },
      { name: QUEUE_NAMES.SMS },
      { name: QUEUE_NAMES.AI_EMBEDDING },
      { name: QUEUE_NAMES.BLOCKCHAIN },
      // Financial rail
      { name: QUEUE_NAMES.PAYMENT_PROCESSING },
      { name: QUEUE_NAMES.BLOCKCHAIN_EVENTS },
      { name: QUEUE_NAMES.TRANSACTION_CONFIRMATION },
      { name: QUEUE_NAMES.WITHDRAWALS },
      { name: QUEUE_NAMES.RECONCILIATION },
      { name: QUEUE_NAMES.DLQ },
    ),
    AutomationModule,
    AiModule,
    BlockchainModule,
    PaymentsModule,
    WalletsModule,
    DealsModule,
  ],
  controllers: [AdminRetryController],
  providers: [
    // Shared services
    DlqPublisherService,
    ReconciliationScheduler,
    DealWonSaga,
    // Existing workers
    EmailWorker,
    NotificationWorker,
    AutomationWorker,
    WebhookWorker,
    SmsWorker,
    AiEmbeddingWorker,
    BlockchainWorker,
    // Financial rail workers
    PaymentProcessingWorker,
    BlockchainEventsWorker,
    TransactionConfirmationWorker,
    WithdrawalWorker,
    ReconciliationWorker,
    DlqWorker,
  ],
})
export class JobsModule {}
