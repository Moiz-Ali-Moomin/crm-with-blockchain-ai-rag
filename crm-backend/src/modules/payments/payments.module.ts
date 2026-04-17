import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { PaymentsService } from './payments.service';
import { PaymentsRepository } from './payments.repository';
import { PaymentsController } from './payments.controller';
import { WalletsModule } from '../wallets/wallets.module';
import { LedgerModule } from '../ledger/ledger.module';
import { EthereumPaymentModule } from '../../blockchain/blockchain.module';
import { QUEUE_NAMES } from '../../core/queue/queue.constants';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    WalletsModule,
    LedgerModule,
    EthereumPaymentModule,
    BullModule.registerQueue(
      { name: QUEUE_NAMES.PAYMENT_PROCESSING },
      { name: QUEUE_NAMES.BLOCKCHAIN_EVENTS },
      { name: QUEUE_NAMES.TRANSACTION_CONFIRMATION },
      { name: QUEUE_NAMES.WEBHOOK_OUTBOUND },
    ),
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentsRepository],
  exports: [PaymentsService, PaymentsRepository],
})
export class PaymentsModule {}
