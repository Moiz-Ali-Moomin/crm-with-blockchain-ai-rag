/**
 * PaymentProcessingWorker
 *
 * Handles payment intents that are triggered programmatically (deal WON, automation).
 * This queue is the entry point for system-initiated payment flows.
 *
 * Job types:
 *   - create_intent: Create a payment intent for a deal or automation trigger
 *   - expire_sweep: Periodically expire stale PENDING payments
 *   - balance_sync: Sync wallet balances from chain to cache
 *
 * This worker does NOT process incoming blockchain events — that's BlockchainEventsWorker.
 */

import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { trace, SpanStatusCode, context as otelContext } from '@opentelemetry/api';
import { QUEUE_NAMES } from '../../core/queue/queue.constants';
import { PaymentsService } from '../../modules/payments/payments.service';
import { WalletsService } from '../../modules/wallets/wallets.service';
import { CreatePaymentDto } from '../../modules/payments/payments.dto';
import { Chain } from '@prisma/client';
import { DlqPublisherService } from '../services/dlq-publisher.service';
import { extractTraceContext } from '../../tracing';

const tracer = trace.getTracer('crm-backend');

export type PaymentJobName = 'create_intent' | 'expire_sweep' | 'balance_sync';

export interface CreateIntentJobPayload {
  tenantId: string;
  walletId: string;
  amountUsdc: string;
  chain: string;
  idempotencyKey: string;
  dealId?: string;
  metadata?: Record<string, unknown>;
}

export interface BalanceSyncJobPayload {
  tenantId: string;
  walletId: string;
}

@Injectable()
@Processor(QUEUE_NAMES.PAYMENT_PROCESSING, { concurrency: 3 })
export class PaymentProcessingWorker extends WorkerHost {
  private readonly logger = new Logger(PaymentProcessingWorker.name);

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly walletsService: WalletsService,
    private readonly dlqPublisher: DlqPublisherService,
  ) {
    super();
  }

  async process(
    job: Job<CreateIntentJobPayload | BalanceSyncJobPayload | Record<string, never>>,
  ): Promise<void> {
    return otelContext.with(extractTraceContext(job.data as Record<string, unknown>), () =>
      tracer.startActiveSpan('payment.create_intent', async (span) => {
        span.setAttributes({ 'job.name': job.name, 'queue.name': job.queueName });
        try {
          await this.dispatch(job);
          span.setStatus({ code: SpanStatusCode.OK });
        } catch (err) {
          const error = err as Error;
          span.recordException(error);
          span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
          throw err;
        } finally {
          span.end();
        }
      }),
    );
  }

  private async dispatch(
    job: Job<CreateIntentJobPayload | BalanceSyncJobPayload | Record<string, never>>,
  ): Promise<void> {
    switch (job.name as PaymentJobName) {
      case 'create_intent':
        return this.handleCreateIntent(job as Job<CreateIntentJobPayload>);
      case 'expire_sweep':
        return this.handleExpireSweep();
      case 'balance_sync':
        return this.handleBalanceSync(job as Job<BalanceSyncJobPayload>);
      default:
        this.logger.warn(`Unknown payment job: ${job.name}`);
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job | undefined, error: Error): Promise<void> {
    if (!job) return;
    await this.dlqPublisher.publishIfExhausted(job, error, true);
  }

  private async handleCreateIntent(job: Job<CreateIntentJobPayload>): Promise<void> {
    const { tenantId, walletId, amountUsdc, chain, idempotencyKey, dealId, metadata } =
      job.data;

    const dto: CreatePaymentDto = {
      idempotencyKey,
      amountUsdc,
      chain: chain as Chain,
      walletId,
      dealId,
      metadata,
    };

    const payment = await this.paymentsService.createPaymentIntent(tenantId, dto);

    this.logger.log(
      `Payment intent created via queue: ${payment.id} (deal: ${dealId ?? 'none'})`,
    );
  }

  private async handleExpireSweep(): Promise<void> {
    const expired = await this.paymentsService.expireStalePendingPayments();
    this.logger.log(`Expiry sweep complete: ${expired} payments expired`);
  }

  private async handleBalanceSync(job: Job<BalanceSyncJobPayload>): Promise<void> {
    const { tenantId, walletId } = job.data;
    const result = await this.walletsService.syncBalance(walletId, tenantId);
    this.logger.log(
      `Balance sync for wallet ${walletId}: ${result.balanceUsdc} USDC`,
    );
  }
}
