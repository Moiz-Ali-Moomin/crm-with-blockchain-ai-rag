/**
 * TransactionConfirmationWorker
 *
 * Polls block confirmations for CONFIRMING payments.
 * Re-enqueues itself with a delay until the threshold is reached or the tx fails.
 *
 * Flow:
 *   1. Fetch current block number from the RPC provider
 *   2. Compute confirmations = currentBlock - txBlockNumber
 *   3. If confirmations >= required: notify PaymentsService → COMPLETED
 *   4. If tx dropped (receipt null after MAX_WAIT_BLOCKS): fail payment
 *   5. Otherwise: re-enqueue with delay (progressive backoff based on confirmations)
 *
 * BullMQ retry handles unexpected errors. The re-enqueue logic handles the
 * "still waiting" case — we use a new job with a delay rather than BullMQ retry
 * because we want precise timing control without counting polling rounds as failures.
 */

import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { trace, SpanStatusCode, context as otelContext } from '@opentelemetry/api';
import { QUEUE_NAMES, QUEUE_JOB_OPTIONS } from '../../core/queue/queue.constants';
import { PaymentsService } from '../../modules/payments/payments.service';
import { PrismaService } from '../../core/database/prisma.service';
import { DlqPublisherService } from '../services/dlq-publisher.service';
import { BusinessMetricsService } from '../../core/metrics/business-metrics.service';
import { extractTraceContext } from '../../observability/tracing';

const tracer = trace.getTracer('crm-backend');

export interface ConfirmationJobPayload {
  paymentId: string;
  tenantId: string;
  txHash: string;
  chain: string;
  targetConfirmations: number;
}

// Per-chain RPC override env vars — fall back to RPC_URL (the primary configured endpoint)
const RPC_ENV: Record<string, string> = {
  POLYGON:  'BLOCKCHAIN_RPC_URL_POLYGON',
  BASE:     'BLOCKCHAIN_RPC_URL_BASE',
  ETHEREUM: 'BLOCKCHAIN_RPC_URL_ETHEREUM',
};
const RPC_FALLBACK = 'RPC_URL';

/** Give up if tx hasn't confirmed after this many blocks */
const MAX_WAIT_BLOCKS = 300; // ~10min on Polygon (2s blocks)

/** Poll intervals based on confirmation progress */
const POLL_DELAY_MS = (confirmations: number, target: number): number => {
  const ratio = confirmations / target;
  if (ratio >= 0.8) return 10_000;  // Almost there — check every 10s
  if (ratio >= 0.5) return 15_000;
  return 30_000;                    // Early stage — check every 30s
};

@Injectable()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
@Processor(QUEUE_NAMES.TRANSACTION_CONFIRMATION, { concurrency: 10 } as any)
export class TransactionConfirmationWorker extends WorkerHost {
  private readonly logger = new Logger(TransactionConfirmationWorker.name);
  private readonly providerCache = new Map<string, ethers.JsonRpcProvider>();

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly dlqPublisher: DlqPublisherService,
    private readonly metrics: BusinessMetricsService,
    @InjectQueue(QUEUE_NAMES.TRANSACTION_CONFIRMATION)
    private readonly confirmationQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<ConfirmationJobPayload>): Promise<void> {
    return otelContext.with(extractTraceContext(job.data as unknown as Record<string, unknown>), () =>
      tracer.startActiveSpan('payment.poll_confirmation', async (span) => {
        const { paymentId, txHash, chain } = job.data;
        span.setAttributes({
          'payment.id':    paymentId,
          'payment.chain': chain,
          'payment.tx_hash': txHash,
          'job.name':      job.name,
        });
        try {
          await this.pollConfirmation(job);
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

  private async pollConfirmation(job: Job<ConfirmationJobPayload>): Promise<void> {
    const { paymentId, txHash, chain, targetConfirmations } = job.data;

    const payment = await this.paymentsService.findAllConfirming().then(
      (list) => list.find((p) => p.id === paymentId),
    );

    if (!payment) {
      // Payment already settled or failed — nothing to do
      this.logger.debug(`Confirmation job for ${paymentId} — payment no longer CONFIRMING`);
      return;
    }

    const provider = this.getProvider(chain);

    const [receipt, currentBlock] = await Promise.all([
      provider.getTransactionReceipt(txHash),
      provider.getBlockNumber(),
    ]);

    // Check for dropped transaction
    if (!receipt) {
      const blocksSinceSeen = payment.blockNumber
        ? currentBlock - Number(payment.blockNumber)
        : 0;

      if (blocksSinceSeen > MAX_WAIT_BLOCKS) {
        this.logger.warn(
          `Payment ${paymentId}: tx ${txHash} not found after ${blocksSinceSeen} blocks — marking FAILED`,
        );
        await this.failPayment(paymentId, payment.tenantId, txHash, 'Transaction dropped from mempool');
        return;
      }

      // Still waiting for mempool inclusion — poll again
      await this.scheduleRecheck(job.data, targetConfirmations, 0);
      return;
    }

    // tx reverted
    if (receipt.status === 0) {
      await this.failPayment(paymentId, payment.tenantId, txHash, 'Transaction reverted on-chain');
      return;
    }

    const confirmations = currentBlock - receipt.blockNumber + 1;

    // Update chain tx record
    await this.prisma.blockchainTransaction.updateMany({
      where: { txHash },
      data: {
        confirmations,
        status: confirmations >= targetConfirmations ? 'CONFIRMED' : 'SUBMITTED',
        confirmedAt: confirmations >= targetConfirmations ? new Date() : undefined,
      },
    });

    if (confirmations >= targetConfirmations) {
      await this.paymentsService.handleConfirmationUpdate({
        paymentId,
        confirmations,
        currentBlockNumber: BigInt(currentBlock),
      });
      this.metrics.recordPaymentSuccess(job.data.tenantId, chain);
      this.logger.log(
        `Payment ${paymentId} confirmed: ${confirmations}/${targetConfirmations} blocks`,
      );
    } else {
      this.logger.debug(
        `Payment ${paymentId}: ${confirmations}/${targetConfirmations} confirmations`,
      );
      await this.paymentsService.handleConfirmationUpdate({
        paymentId,
        confirmations,
        currentBlockNumber: BigInt(currentBlock),
      });
      await this.scheduleRecheck(job.data, targetConfirmations, confirmations);
    }
  }

  private async failPayment(
    paymentId: string,
    tenantId: string,
    txHash: string,
    reason: string,
  ): Promise<void> {
    await this.prisma.blockchainTransaction.updateMany({
      where: { txHash },
      data: { status: 'FAILED' },
    });
    await this.paymentsService.failPayment(paymentId, tenantId, reason);
    this.metrics.recordPaymentFailed(tenantId, 'on_chain_failure');
  }

  private async scheduleRecheck(
    payload: ConfirmationJobPayload,
    target: number,
    currentConfirmations: number,
  ): Promise<void> {
    const delay = POLL_DELAY_MS(currentConfirmations, target);
    // Replace the existing job by using the same jobId (BullMQ replaces queued jobs)
    await this.confirmationQueue.add('poll_confirmations', payload, {
      ...QUEUE_JOB_OPTIONS.transactionConfirmation,
      jobId: `confirm-${payload.paymentId}`,
      delay,
    });
  }

  private getProvider(chain: string): ethers.JsonRpcProvider {
    const cached = this.providerCache.get(chain);
    if (cached) return cached;

    const envKey = RPC_ENV[chain];
    const rpcUrl = this.config.get<string>(envKey) ?? this.config.getOrThrow<string>(RPC_FALLBACK);
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    this.providerCache.set(chain, provider);
    return provider;
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<ConfirmationJobPayload> | undefined, error: Error): Promise<void> {
    if (!job) return;
    this.metrics.recordPaymentFailed(job.data.tenantId ?? 'unknown', 'worker_exhausted');
    await this.dlqPublisher.publishIfExhausted(job, error, true);
  }
}
