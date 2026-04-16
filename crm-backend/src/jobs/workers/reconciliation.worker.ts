/**
 * ReconciliationWorker
 *
 * Safety-net worker that guarantees no valid USDC deposit is permanently missed
 * even if BlockchainListenerService was down or fell behind.
 *
 * Triggered by ReconciliationScheduler every 2 minutes via a singleton BullMQ job.
 *
 * Algorithm per run:
 *   1. Fetch all PENDING payments that have not yet expired (≤ 500 at a time)
 *   2. For each payment, call the chain's USDC contract to query Transfer events
 *      directed at the payment's toAddress in the last SCAN_WINDOW_BLOCKS blocks
 *   3. If a Transfer event matches the expected amount (±1 atomic unit tolerance):
 *      a. Call PaymentsService.handleTxDetected() → transitions PENDING → CONFIRMING
 *      b. Enqueue a confirmation polling job (idempotent jobId prevents duplicates)
 *   4. Record recovered count in Prometheus (reconciliation_recovered_total)
 *
 * Idempotency:
 *   - handleTxDetected() is guarded by PaymentStateMachine.canAcceptDeposit() — calling
 *     it on an already-CONFIRMING payment is a safe no-op.
 *   - Confirmation job uses jobId = `confirm:${paymentId}` — BullMQ deduplicates.
 *
 * Fault isolation:
 *   Each payment is processed independently; errors on one do not abort the run.
 *   The job itself is NOT pushed to DLQ on failure — reconciliation is periodic
 *   and the next cron tick will retry the whole run naturally.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { Prisma, Payment } from '@prisma/client';
import { trace, SpanStatusCode, context as otelContext } from '@opentelemetry/api';
import { QUEUE_NAMES, QUEUE_JOB_OPTIONS } from '../../core/queue/queue.constants';
import { PaymentsService } from '../../modules/payments/payments.service';
import { PaymentsRepository } from '../../modules/payments/payments.repository';
import { BusinessMetricsService } from '../../core/metrics/business-metrics.service';
import { extractTraceContext } from '../../tracing';
import { USDC_ADDRESSES } from '../../modules/wallets/wallets.service';
import { SupportedChain } from '../../modules/blockchain/custody/custody.interface';

export interface ReconciliationJobPayload {
  triggeredAt: string;
  _otel?: Record<string, string>;
}

export interface ReconciliationResult {
  scanned: number;
  recovered: number;
  errors: number;
  durationMs: number;
}

// Minimal ABI — only the Transfer event
const ERC20_ABI = ['event Transfer(address indexed from, address indexed to, uint256 value)'];

// Scan the last ~30 minutes worth of blocks per chain:
//   Polygon / BASE: ~2 s/block → 900 blocks ≈ 30 min
//   Ethereum:      ~12 s/block → 150 blocks ≈ 30 min
const SCAN_WINDOW: Record<string, number> = {
  POLYGON:  900,
  BASE:     900,
  ETHEREUM: 150,
};

const RPC_ENV: Record<string, string> = {
  POLYGON:  'BLOCKCHAIN_RPC_URL_POLYGON',
  BASE:     'BLOCKCHAIN_RPC_URL_BASE',
  ETHEREUM: 'BLOCKCHAIN_RPC_URL_ETHEREUM',
};

const tracer = trace.getTracer('crm-backend');

@Injectable()
@Processor(QUEUE_NAMES.RECONCILIATION, { concurrency: 1 })
export class ReconciliationWorker extends WorkerHost {
  private readonly logger = new Logger(ReconciliationWorker.name);
  private readonly providerCache = new Map<string, ethers.JsonRpcProvider>();

  constructor(
    private readonly paymentsRepo: PaymentsRepository,
    private readonly paymentsService: PaymentsService,
    private readonly config: ConfigService,
    private readonly metrics: BusinessMetricsService,
    @InjectQueue(QUEUE_NAMES.TRANSACTION_CONFIRMATION)
    private readonly confirmationQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<ReconciliationJobPayload>): Promise<ReconciliationResult> {
    return otelContext.with(extractTraceContext(job.data as unknown as Record<string, unknown>), () =>
      tracer.startActiveSpan('reconciliation.run', async (span) => {
        const start = Date.now();
        try {
          const result = await this.runReconciliation();
          span.setAttributes({
            'reconciliation.scanned':   result.scanned,
            'reconciliation.recovered': result.recovered,
            'reconciliation.errors':    result.errors,
            'reconciliation.duration_ms': result.durationMs,
          });
          span.setStatus({ code: SpanStatusCode.OK });
          return result;
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

  private async runReconciliation(): Promise<ReconciliationResult> {
    const start = Date.now();
    const pending = await this.paymentsRepo.findAllPending();

    if (pending.length === 0) {
      this.logger.debug('Reconciliation: no PENDING payments — nothing to scan');
      return { scanned: 0, recovered: 0, errors: 0, durationMs: Date.now() - start };
    }

    this.logger.log(`Reconciliation: scanning ${pending.length} PENDING payments`);

    let recovered = 0;
    let errors = 0;

    for (const payment of pending) {
      try {
        const match = await this.findOnChainTransfer(payment);
        if (!match) continue;

        // Trigger the same flow BlockchainEventsWorker would have triggered
        await this.paymentsService.handleTxDetected({
          paymentId:   payment.id,
          txHash:      match.txHash,
          fromAddress: match.fromAddress,
          blockNumber: match.blockNumber,
        });

        // Enqueue confirmation polling — jobId deduplicates with any live listener job
        await this.confirmationQueue.add(
          'poll_confirmations',
          {
            paymentId:            payment.id,
            tenantId:             payment.tenantId,
            txHash:               match.txHash,
            chain:                payment.chain,
            targetConfirmations:  payment.requiredConfirmations,
          },
          {
            ...QUEUE_JOB_OPTIONS.transactionConfirmation,
            jobId: `confirm:${payment.id}`,
            delay: 15_000,
          },
        );

        recovered++;
        this.logger.log(
          `Reconciliation: recovered payment ${payment.id} ` +
          `(chain: ${payment.chain}, tx: ${match.txHash})`,
        );
      } catch (err) {
        errors++;
        this.logger.error(
          `Reconciliation error for payment ${payment.id}: ${(err as Error).message}`,
        );
      }
    }

    const durationMs = Date.now() - start;

    if (recovered > 0) {
      this.metrics.recordReconciliationRecovered(recovered);
    }

    this.logger.log(
      `Reconciliation complete in ${durationMs}ms — ` +
      `scanned: ${pending.length}, recovered: ${recovered}, errors: ${errors}`,
    );

    return { scanned: pending.length, recovered, errors, durationMs };
  }

  private async findOnChainTransfer(payment: Payment): Promise<{
    txHash: string;
    fromAddress: string;
    blockNumber: bigint;
  } | null> {
    const chain = payment.chain as string;
    const usdcAddress = USDC_ADDRESSES[chain as SupportedChain];
    if (!usdcAddress) {
      this.logger.warn(`Reconciliation: no USDC address for chain ${chain} — skipping`);
      return null;
    }

    const provider    = this.getProvider(chain);
    const currentBlock = await provider.getBlockNumber();
    const scanWindow  = SCAN_WINDOW[chain] ?? 900;
    const fromBlock   = Math.max(0, currentBlock - scanWindow);

    const usdc   = new ethers.Contract(usdcAddress, ERC20_ABI, provider);
    const filter = usdc.filters.Transfer(null, payment.toAddress);
    const events = await usdc.queryFilter(filter, fromBlock, currentBlock);

    if (events.length === 0) return null;

    // Expected amount in atomic units (USDC has 6 decimals)
    const expectedRaw = BigInt(
      (payment.amountUsdc as unknown as Prisma.Decimal)
        .mul(new Prisma.Decimal('1000000'))
        .toFixed(0),
    );

    // Accept the first event that is at least the expected amount (allow overpayment)
    const match = events.find((e) => {
      const log = e as ethers.EventLog;
      return BigInt(log.args.value) >= expectedRaw - 1n; // ±1 atomic unit tolerance
    }) as ethers.EventLog | undefined;

    if (!match) return null;

    return {
      txHash:      match.transactionHash,
      fromAddress: match.args.from as string,
      blockNumber: BigInt(match.blockNumber ?? 0),
    };
  }

  private getProvider(chain: string): ethers.JsonRpcProvider {
    const cached = this.providerCache.get(chain);
    if (cached) return cached;

    const envKey = RPC_ENV[chain];
    if (!envKey) throw new Error(`Unknown chain for reconciliation: ${chain}`);

    const rpcUrl  = this.config.getOrThrow<string>(envKey);
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    this.providerCache.set(chain, provider);
    return provider;
  }

  // Reconciliation failure is non-critical: next cron tick retries naturally
  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, error: Error): void {
    this.logger.error(
      `Reconciliation job failed (will retry on next cron tick): ${error.message}`,
      { jobId: job?.id },
    );
  }
}
