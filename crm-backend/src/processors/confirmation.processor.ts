/**
 * ConfirmationProcessor
 *
 * Polls block confirmations for CONFIRMING payments until the required threshold
 * is met, the transaction is declared dropped, or it reverts.
 *
 * Queue:      transaction-confirmation
 * Concurrency: 10 — high volume of independently-polled payments is expected
 *
 * Adaptive poll schedule:
 *   confirmations / target < 50%  → 30 s  (low urgency, early stage)
 *   50% – 80%                     → 15 s
 *   > 80%                         → 10 s  (almost there, tighten polling)
 *
 * Timeout:
 *   If the receipt is still absent after MAX_WAIT_BLOCKS from first detection,
 *   the transaction is declared dropped and the payment is marked FAILED.
 *   Default: 300 blocks (~10 min on Polygon / BASE at 2 s/block).
 *
 * Reorg handling:
 *   After re-checking confirmations, if the receipt block has changed (reorg),
 *   the confirmation count is recomputed from the new head. The payment only
 *   settles when the recomputed count reaches the required threshold — basic but
 *   sufficient for the 2–5 block confirmation windows used in production.
 *
 * Multi-chain:
 *   Each payment carries a chain label. This processor maintains a per-chain
 *   HTTP provider cache keyed by the chain's env-var RPC URL so a single worker
 *   handles POLYGON, BASE, and ETHEREUM concurrently without cross-chain provider
 *   confusion.
 *
 * Environment variables:
 *   BLOCKCHAIN_RPC_URL_POLYGON   — JSON-RPC HTTP for Polygon
 *   BLOCKCHAIN_RPC_URL_BASE      — JSON-RPC HTTP for Base
 *   BLOCKCHAIN_RPC_URL_ETHEREUM  — JSON-RPC HTTP for Ethereum
 *   RPC_URL_HTTP                 — fallback single-chain HTTP URL
 *   CONFIRMATIONS_REQUIRED       — default confirmation threshold (overridden per payment)
 */

import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { trace, SpanStatusCode, context as otelContext } from '@opentelemetry/api';
import { QUEUE_NAMES, QUEUE_JOB_OPTIONS } from '../core/queue/queue.constants';
import { PaymentsService } from '../modules/payments/payments.service';
import { PrismaService } from '../core/database/prisma.service';
import { BusinessMetricsService } from '../core/metrics/business-metrics.service';
import { DlqPublisherService } from '../jobs/services/dlq-publisher.service';
import { extractTraceContext } from '../observability/tracing';

const tracer = trace.getTracer('crm-backend');

export interface ConfirmationJobPayload {
  paymentId:           string;
  tenantId:            string;
  txHash:              string;
  chain:               string;
  targetConfirmations: number;
}

// Per-chain HTTP RPC env var keys (matches existing BlockchainListenerService convention)
const CHAIN_RPC_ENV: Record<string, string> = {
  POLYGON:  'BLOCKCHAIN_RPC_URL_POLYGON',
  BASE:     'BLOCKCHAIN_RPC_URL_BASE',
  ETHEREUM: 'BLOCKCHAIN_RPC_URL_ETHEREUM',
};

/** Give up if the receipt is still missing after this many blocks from first detection */
const MAX_WAIT_BLOCKS = 300; // ~10 min on Polygon / BASE (2 s blocks)

const pollDelayMs = (confirmations: number, target: number): number => {
  const ratio = confirmations / Math.max(target, 1);
  if (ratio >= 0.8) return 10_000;
  if (ratio >= 0.5) return 15_000;
  return 30_000;
};

@Injectable()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
@Processor(QUEUE_NAMES.TRANSACTION_CONFIRMATION, { concurrency: 10 } as any)
export class ConfirmationProcessor extends WorkerHost {
  private readonly logger = new Logger(ConfirmationProcessor.name);

  /** Lazy-initialised HTTP provider per chain — shared across concurrent jobs */
  private readonly _providerCache = new Map<string, ethers.JsonRpcProvider>();

  /** Default confirmation threshold — overridden by per-payment requiredConfirmations */
  private readonly defaultConfirmations: number;

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly prisma:          PrismaService,
    private readonly config:          ConfigService,
    private readonly metrics:         BusinessMetricsService,
    private readonly dlqPublisher:    DlqPublisherService,
    @InjectQueue(QUEUE_NAMES.TRANSACTION_CONFIRMATION)
    private readonly confirmationQueue: Queue,
  ) {
    super();
    this.defaultConfirmations = this.config.get<number>('CONFIRMATIONS_REQUIRED', 3);
  }

  // ─── Worker Entry Point ────────────────────────────────────────────────────

  async process(job: Job<ConfirmationJobPayload>): Promise<void> {
    return otelContext.with(
      extractTraceContext(job.data as unknown as Record<string, unknown>),
      () =>
        tracer.startActiveSpan('payment.poll_confirmation', async (span) => {
          const { paymentId, txHash, chain } = job.data;

          span.setAttributes({
            'payment.id':       paymentId,
            'payment.chain':    chain,
            'payment.tx_hash':  txHash,
            'job.id':           job.id ?? '',
            'job.name':         job.name,
          });

          try {
            await this.pollConfirmation(job);
            span.setStatus({ code: SpanStatusCode.OK });
          } catch (err) {
            const error = err as Error;
            span.recordException(error);
            span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
            throw error;
          } finally {
            span.end();
          }
        }),
    );
  }

  // ─── Core Polling Logic ────────────────────────────────────────────────────

  private async pollConfirmation(job: Job<ConfirmationJobPayload>): Promise<void> {
    const { paymentId, txHash, chain, tenantId } = job.data;
    const target = job.data.targetConfirmations ?? this.defaultConfirmations;

    // Verify the payment is still CONFIRMING — it may have been settled by
    // reconciliation or a parallel job between poll cycles
    const confirming = await this.paymentsService.findAllConfirming();
    const payment    = confirming.find((p) => p.id === paymentId);

    if (!payment) {
      this.logger.debug(
        `ConfirmationProcessor: payment ${paymentId} no longer CONFIRMING — job complete`,
      );
      return;
    }

    const provider = this.getProvider(chain);

    // Fetch receipt and current head in parallel
    const [receipt, currentBlock] = await Promise.all([
      provider.getTransactionReceipt(txHash),
      provider.getBlockNumber(),
    ]);

    // ── Case 1: Receipt not yet available (mempool or pending inclusion) ──────
    if (!receipt) {
      const blocksSinceSeen = payment.blockNumber
        ? currentBlock - Number(payment.blockNumber)
        : 0;

      if (blocksSinceSeen > MAX_WAIT_BLOCKS) {
        this.logger.warn(
          `ConfirmationProcessor: payment ${paymentId} — tx ${txHash} absent after ` +
          `${blocksSinceSeen} blocks → FAILED (dropped from mempool)`,
        );
        await this.failPayment(paymentId, tenantId, txHash, 'Transaction dropped from mempool');
        return;
      }

      // Still waiting — reschedule with fast cadence (receipt might appear next block)
      this.logger.debug(
        `ConfirmationProcessor: payment ${paymentId} — no receipt yet ` +
        `(${blocksSinceSeen}/${MAX_WAIT_BLOCKS} blocks elapsed)`,
      );
      await this.scheduleRecheck(job.data, target, 0);
      return;
    }

    // ── Case 2: Transaction reverted (EVM status 0) ───────────────────────────
    if (receipt.status === 0) {
      this.logger.warn(
        `ConfirmationProcessor: payment ${paymentId} — tx ${txHash} reverted on-chain`,
      );
      await this.failPayment(paymentId, tenantId, txHash, 'Transaction reverted on-chain');
      return;
    }

    // ── Case 3: Transaction included — check confirmation count ───────────────
    // confirmations = blocks since inclusion (inclusive of the tx block itself)
    const confirmations = currentBlock - receipt.blockNumber + 1;

    this.logger.debug(
      `ConfirmationProcessor: payment ${paymentId} — ` +
      `${confirmations}/${target} confirmations (block ${receipt.blockNumber})`,
    );

    // Persist the updated confirmation count on the chain tx record
    await this.prisma.blockchainTransaction.updateMany({
      where: { txHash },
      data:  {
        confirmations,
        status:      confirmations >= target ? 'CONFIRMED' : 'SUBMITTED',
        confirmedAt: confirmations >= target ? new Date() : undefined,
      },
    });

    // Update payment state regardless — the service handles partial confirmation updates
    await this.paymentsService.handleConfirmationUpdate({
      paymentId,
      confirmations,
      currentBlockNumber: BigInt(currentBlock),
    });

    if (confirmations >= target) {
      // PaymentsService.handleConfirmationUpdate already settled when >= target
      this.metrics.recordPaymentSuccess(tenantId, chain);
      this.logger.log(
        `ConfirmationProcessor: payment ${paymentId} CONFIRMED ` +
        `(${confirmations}/${target} blocks, chain: ${chain})`,
      );
    } else {
      // Not yet done — reschedule with adaptive delay
      await this.scheduleRecheck(job.data, target, confirmations);
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async failPayment(
    paymentId: string,
    tenantId:  string,
    txHash:    string,
    reason:    string,
  ): Promise<void> {
    await this.prisma.blockchainTransaction.updateMany({
      where: { txHash },
      data:  { status: 'FAILED' },
    });
    await this.paymentsService.failPayment(paymentId, tenantId, reason);
    this.metrics.recordPaymentFailed(tenantId, 'on_chain_failure');
  }

  private async scheduleRecheck(
    payload:              ConfirmationJobPayload,
    target:               number,
    currentConfirmations: number,
  ): Promise<void> {
    const delay = pollDelayMs(currentConfirmations, target);

    // Re-use the same jobId — BullMQ replaces the queued job with updated delay.
    // This prevents accumulating stale poll jobs for the same payment.
    await this.confirmationQueue.add('poll_confirmations', payload, {
      ...QUEUE_JOB_OPTIONS.transactionConfirmation,
      jobId: `confirm-${payload.paymentId}`,
      delay,
    });
  }

  /**
   * Returns a cached HTTP JsonRpcProvider for the given chain.
   * Prefers per-chain env var (BLOCKCHAIN_RPC_URL_{CHAIN}), falls back to
   * RPC_URL_HTTP for single-chain deployments.
   */
  private getProvider(chain: string): ethers.JsonRpcProvider {
    const cached = this._providerCache.get(chain);
    if (cached) return cached;

    const chainEnvKey = CHAIN_RPC_ENV[chain.toUpperCase()];
    const rpcUrl      = chainEnvKey
      ? (this.config.get<string>(chainEnvKey) ?? this.config.getOrThrow<string>('RPC_URL_HTTP'))
      : this.config.getOrThrow<string>('RPC_URL_HTTP');

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    this._providerCache.set(chain, provider);
    return provider;
  }

  // ─── DLQ Escalation ───────────────────────────────────────────────────────

  @OnWorkerEvent('failed')
  async onFailed(
    job: Job<ConfirmationJobPayload> | undefined,
    error: Error,
  ): Promise<void> {
    if (!job) return;

    this.metrics.recordPaymentFailed(job.data.tenantId ?? 'unknown', 'worker_exhausted');

    this.logger.error(
      `ConfirmationProcessor: job ${job.id} exhausted ` +
      `(${job.attemptsMade}/${job.opts.attempts ?? 1} attempts): ${error.message}`,
    );

    await this.dlqPublisher.publishIfExhausted(job, error, /* critical */ true);
  }
}
