/**
 * BlockchainEventsWorker
 *
 * Processes raw USDC Transfer events from the blockchain-events queue.
 * Produced by BlockchainListenerService; one job per Transfer log.
 *
 * Matching:
 *   - Looks up a payment by toAddress (case-insensitive) + chain
 *   - Accepts PENDING and PARTIAL statuses (partial accumulation path)
 *   - Normalises all addresses to lowercase before comparison
 *
 * Amount handling (USDC = 6 decimals):
 *   - exact match  (diff == 0)  → CONFIRMING  (settle for amountUsdc)
 *   - overpayment  (diff > 0)   → CONFIRMING  (excess noted in event metadata)
 *   - underpayment (diff < 0)   → PARTIAL     (accumulate; wait for more funds)
 *   - cumulative partial meets threshold → CONFIRMING
 *
 * Safety:
 *   - Deduplication: BlockchainTransaction upsert on (txHash, logIndex) — idempotent
 *   - BullMQ jobId = `transfer:{chain}:{txHash}:{logIndex}` — no duplicate queue jobs
 *   - State machine guards every transition — terminal payments are never re-processed
 *
 * Confirmation:
 *   - Only enqueued when payment crosses the threshold (CONFIRMING entry)
 *   - Minimum block confirmations set per payment.requiredConfirmations
 */

import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Chain, Prisma } from '@prisma/client';
import { trace, SpanStatusCode, context as otelContext } from '@opentelemetry/api';
import { QUEUE_NAMES, QUEUE_JOB_OPTIONS } from '../../core/queue/queue.constants';
import { PaymentsService } from '../../modules/payments/payments.service';
import { BlockchainTransferEvent } from '../../modules/blockchain/listener/blockchain-listener.service';
import { PrismaService } from '../../core/database/prisma.service';
import { DlqPublisherService } from '../services/dlq-publisher.service';
import { extractTraceContext } from '../../tracing';

const USDC_DECIMALS = 6;
const USDC_SCALAR   = new Prisma.Decimal(10 ** USDC_DECIMALS); // 1_000_000

const tracer = trace.getTracer('crm-backend');

@Injectable()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
@Processor(QUEUE_NAMES.BLOCKCHAIN_EVENTS, { concurrency: 5 } as any)
export class BlockchainEventsWorker extends WorkerHost {
  private readonly logger = new Logger(BlockchainEventsWorker.name);

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly prisma: PrismaService,
    private readonly dlqPublisher: DlqPublisherService,
    @InjectQueue(QUEUE_NAMES.TRANSACTION_CONFIRMATION)
    private readonly confirmationQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<BlockchainTransferEvent>): Promise<void> {
    return otelContext.with(extractTraceContext(job.data as unknown as Record<string, unknown>), () =>
      tracer.startActiveSpan('blockchain.process_transfer', async (span) => {
        const event = job.data;
        span.setAttributes({
          'blockchain.chain':        event.chain,
          'blockchain.tx_hash':      event.txHash,
          'blockchain.from_address': event.fromAddress,
          'blockchain.to_address':   event.toAddress,
          'blockchain.amount_raw':   event.amountRaw,
          'job.name':                job.name,
        });
        try {
          await this.handleTransfer(event);
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

  private async handleTransfer(event: BlockchainTransferEvent): Promise<void> {
    // ── 1. Normalise addresses to lowercase ─────────────────────────────────
    const toAddressNorm   = event.toAddress.toLowerCase();
    const fromAddressNorm = event.fromAddress.toLowerCase();

    this.logger.log(
      `[Transfer] chain=${event.chain} tx=${event.txHash.slice(0, 14)}… ` +
      `logIndex=${event.logIndex} from=${fromAddressNorm.slice(0, 10)}… ` +
      `to=${toAddressNorm.slice(0, 10)}… amountRaw=${event.amountRaw}`,
    );

    // ── 2. Deduplication — skip if we already recorded this Transfer log ────
    //    The upsert below is idempotent, but skip the expensive payment lookup
    //    if this exact log was already fully processed.
    const existingTx = await this.prisma.blockchainTransaction.findUnique({
      where: { txHash_logIndex: { txHash: event.txHash, logIndex: event.logIndex } },
      select: { id: true, paymentId: true },
    });

    if (existingTx?.paymentId) {
      this.logger.debug(
        `[Transfer] tx=${event.txHash} logIndex=${event.logIndex} already processed — skipping`,
      );
      return;
    }

    // ── 3. Match to an open payment (PENDING or PARTIAL) ────────────────────
    const payment = await this.paymentsService.findPendingByAddress(
      toAddressNorm,
      event.chain as Chain,
    );

    if (!payment) {
      this.logger.debug(
        `[Transfer] No open payment for ${toAddressNorm} on ${event.chain} — discarding`,
      );
      return;
    }

    this.logger.log(
      `[Transfer] Matched payment ${payment.id} (status=${payment.status}, ` +
      `expected=${payment.amountUsdc.toFixed(USDC_DECIMALS)} USDC)`,
    );

    // ── 4. Convert raw amount to USDC Decimal ───────────────────────────────
    //    amountRaw is a string BigInt representing the value in atomic units.
    //    Divide by 10^6 to get the human-readable USDC amount.
    const receivedUsdc = new Prisma.Decimal(event.amountRaw).div(USDC_SCALAR);

    // ── 5. Calculate cumulative received amount ──────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const previousReceivedUsdc: Prisma.Decimal = (payment as any).receivedAmountUsdc
      ? new Prisma.Decimal((payment as any).receivedAmountUsdc.toString())
      : new Prisma.Decimal(0);

    const newReceivedUsdc = previousReceivedUsdc.add(receivedUsdc);

    const expectedRaw  = payment.amountUsdc.mul(USDC_SCALAR).toFixed(0);
    const expectedBig  = BigInt(expectedRaw);

    // Cumulative raw (previous already stored in DB as Decimal; use Decimal math)
    const newReceivedRaw = BigInt(newReceivedUsdc.mul(USDC_SCALAR).toFixed(0));

    this.logger.log(
      `[Transfer] Payment ${payment.id}: ` +
      `prev=${previousReceivedUsdc.toFixed(USDC_DECIMALS)} + ` +
      `this=${receivedUsdc.toFixed(USDC_DECIMALS)} = ` +
      `cumulative=${newReceivedUsdc.toFixed(USDC_DECIMALS)} USDC ` +
      `(expected=${payment.amountUsdc.toFixed(USDC_DECIMALS)} USDC)`,
    );

    // ── 6. Record the blockchain transaction (idempotent upsert) ────────────
    await this.prisma.blockchainTransaction.upsert({
      where: { txHash_logIndex: { txHash: event.txHash, logIndex: event.logIndex } },
      create: {
        txHash:      event.txHash,
        logIndex:    event.logIndex,
        chain:       event.chain as Chain,
        status:      'SUBMITTED',
        fromAddress: fromAddressNorm,
        toAddress:   toAddressNorm,
        amountRaw:   event.amountRaw,
        blockNumber: BigInt(event.blockNumber),
        firstSeenAt: new Date(),
        tenant:      { connect: { id: payment.tenantId } },
        payment:     { connect: { id: payment.id } },
      },
      update: {
        // Idempotent — never overwrite confirmed data with stale replay
      },
    });

    // ── 7. Determine outcome: PARTIAL or CONFIRMING ──────────────────────────
    //
    //   Tolerance: allow up to 1 atomic unit shortfall to absorb rounding from
    //   some wallets that truncate the last decimal place.
    //
    //   newReceivedRaw >= expectedBig - 1n  →  threshold met  →  CONFIRMING
    //   newReceivedRaw <  expectedBig - 1n  →  still short    →  PARTIAL

    if (newReceivedRaw >= expectedBig - 1n) {
      // ── Threshold met: move to CONFIRMING ──────────────────────────────────
      const excessRaw  = newReceivedRaw - expectedBig;
      const excessUsdc = new Prisma.Decimal(excessRaw.toString()).div(USDC_SCALAR);

      if (excessRaw > 0n) {
        this.logger.warn(
          `[Transfer] Payment ${payment.id}: overpayment of ` +
          `${excessUsdc.toFixed(USDC_DECIMALS)} USDC — settling for expected amount`,
        );
      }

      await this.paymentsService.handleTxDetected({
        paymentId:             payment.id,
        txHash:                event.txHash,
        fromAddress:           fromAddressNorm,
        blockNumber:           BigInt(event.blockNumber),
        newReceivedAmountUsdc: newReceivedUsdc,
      });

      // Enqueue confirmation polling (jobId deduplicates retries in BullMQ)
      await this.confirmationQueue.add(
        'poll_confirmations',
        {
          paymentId:           payment.id,
          tenantId:            payment.tenantId,
          txHash:              event.txHash,
          chain:               event.chain,
          targetConfirmations: payment.requiredConfirmations,
        },
        {
          ...QUEUE_JOB_OPTIONS.transactionConfirmation,
          jobId:  `confirm-${payment.id}`,
          delay:  15_000, // First poll after 15s — Polygon ~2s blocks
        },
      );

      this.logger.log(
        `[Transfer] Payment ${payment.id} → CONFIRMING after ` +
        `${newReceivedUsdc.toFixed(USDC_DECIMALS)} USDC received ` +
        `(tx: ${event.txHash}, ` +
        `confirmations required: ${payment.requiredConfirmations})`,
      );
    } else {
      // ── Underpayment: accumulate, stay PARTIAL ─────────────────────────────
      const stillNeededUsdc = payment.amountUsdc.sub(newReceivedUsdc);

      await this.paymentsService.handlePartialDeposit({
        paymentId:             payment.id,
        fromAddress:           fromAddressNorm,
        newReceivedAmountUsdc: newReceivedUsdc,
      });

      this.logger.log(
        `[Transfer] Payment ${payment.id} → PARTIAL ` +
        `(received so far: ${newReceivedUsdc.toFixed(USDC_DECIMALS)} USDC, ` +
        `still needed: ${stillNeededUsdc.toFixed(USDC_DECIMALS)} USDC)`,
      );
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<BlockchainTransferEvent> | undefined, error: Error): Promise<void> {
    if (!job) return;
    await this.dlqPublisher.publishIfExhausted(job, error, true);
  }
}
