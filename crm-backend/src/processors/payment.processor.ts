/**
 * PaymentProcessor
 *
 * Matches confirmed on-chain USDC Transfer events to PENDING payment intents,
 * then advances the payment state machine to CONFIRMING.
 *
 * Queue:  blockchain-events
 * Input:  IncomingTransferJob (emitted by PaymentListenerService / BlockchainListenerService)
 * JobId:  transfer:{txHash}:{logIndex}  — BullMQ deduplicates at enqueue time
 *
 * Processing steps:
 *   1. Lookup PENDING payment by recipient address + chain
 *   2. Upsert a BlockchainTransaction record (idempotent on txHash)
 *   3. Validate received amount against expected (reject underpayments)
 *   4. Transition payment PENDING → CONFIRMING via PaymentsService
 *   5. Enqueue a confirmation polling job (idempotent jobId: confirm:{paymentId})
 *
 * Idempotency:
 *   - BullMQ jobId prevents re-processing on listener reconnect
 *   - blockchainTransaction.upsert() is a no-op on duplicate txHash
 *   - PaymentStateMachine.canAcceptDeposit() guards the state transition
 *   - The confirmation job uses a stable jobId — BullMQ replaces any queued duplicate
 *
 * Error handling:
 *   BullMQ retries on any uncaught error (see QUEUE_JOB_OPTIONS.blockchainEvents).
 *   After max retries @OnWorkerEvent('failed') pushes to DLQ via DlqPublisherService.
 */

import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Chain, Prisma } from '@prisma/client';
import { trace, SpanStatusCode, context as otelContext } from '@opentelemetry/api';
import { QUEUE_NAMES, QUEUE_JOB_OPTIONS } from '../core/queue/queue.constants';
import { PaymentsService } from '../modules/payments/payments.service';
import { PrismaService } from '../core/database/prisma.service';
import { DlqPublisherService } from '../jobs/services/dlq-publisher.service';
import { UsdcContractService } from '../blockchain/usdc.contract';
import { extractTraceContext } from '../observability/tracing';
import type { IncomingTransferJob } from '../blockchain/blockchain.listener';

const tracer = trace.getTracer('crm-backend');

/**
 * Tolerance for USDC atomic unit rounding.
 * 1 atomic unit = 0.000001 USDC — acceptable drift from decimal conversion.
 */
const AMOUNT_TOLERANCE = 1n;

@Injectable()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
@Processor(QUEUE_NAMES.BLOCKCHAIN_EVENTS, { concurrency: 5 } as any)
export class PaymentProcessor extends WorkerHost {
  private readonly logger = new Logger(PaymentProcessor.name);

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly prisma:          PrismaService,
    private readonly usdc:            UsdcContractService,
    private readonly dlqPublisher:    DlqPublisherService,
    @InjectQueue(QUEUE_NAMES.TRANSACTION_CONFIRMATION)
    private readonly confirmationQueue: Queue,
  ) {
    super();
  }

  // ─── Worker Entry Point ────────────────────────────────────────────────────

  async process(job: Job<IncomingTransferJob>): Promise<void> {
    return otelContext.with(
      extractTraceContext(job.data as unknown as Record<string, unknown>),
      () =>
        tracer.startActiveSpan('payment.process_transfer', async (span) => {
          const { txHash, fromAddress, toAddress, chain, amountRaw } = job.data;

          span.setAttributes({
            'payment.tx_hash':      txHash,
            'payment.from_address': fromAddress,
            'payment.to_address':   toAddress,
            'payment.chain':        chain,
            'payment.amount_raw':   amountRaw,
            'job.id':               job.id ?? '',
            'job.name':             job.name,
          });

          try {
            await this.handleTransfer(job.data);
            span.setStatus({ code: SpanStatusCode.OK });
          } catch (err) {
            const error = err as Error;
            span.recordException(error);
            span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
            throw error; // rethrow so BullMQ retries
          } finally {
            span.end();
          }
        }),
    );
  }

  // ─── Core Logic ────────────────────────────────────────────────────────────

  private async handleTransfer(event: IncomingTransferJob): Promise<void> {
    this.logger.debug(
      `[${event.chain}] Transfer: ${event.fromAddress.slice(0, 10)}… → ` +
      `${event.toAddress.slice(0, 10)}… | ` +
      `${this.usdc.formatUsdc(BigInt(event.amountRaw))} USDC (${event.txHash.slice(0, 12)}…)`,
    );

    // ── Step 1: Match to a PENDING payment ────────────────────────────────────
    const payment = await this.paymentsService.findPendingByAddress(
      event.toAddress,
      event.chain as Chain,
    );

    if (!payment) {
      // Transfer to an address not expecting a payment — discard cleanly.
      // This is normal: USDC is a public token; many unrelated transfers happen.
      this.logger.debug(
        `No PENDING payment for ${event.toAddress} on ${event.chain} — discarding`,
      );
      return;
    }

    // ── Step 2: Persist the on-chain transaction (idempotent) ─────────────────
    // Unique key is (txHash, logIndex) — a single tx can emit multiple Transfer
    // events at different log indices. Upsert on both fields to avoid collision.
    await this.prisma.blockchainTransaction.upsert({
      where:  { txHash_logIndex: { txHash: event.txHash, logIndex: event.logIndex } },
      create: {
        tenantId:    payment.tenantId,
        paymentId:   payment.id,
        txHash:      event.txHash,
        logIndex:    event.logIndex,
        chain:       event.chain as Chain,
        status:      'SUBMITTED',
        fromAddress: event.fromAddress,
        toAddress:   event.toAddress,
        amountRaw:   event.amountRaw,
        blockNumber: BigInt(event.blockNumber),
        firstSeenAt: new Date(),
      },
      update: {
        // Intentionally empty — never overwrite confirmed data on duplicate delivery
      },
    });

    // ── Step 3: Amount validation ─────────────────────────────────────────────
    // Compute expected amount in atomic units from the DB Decimal value
    const expectedRaw = BigInt(
      (payment.amountUsdc as unknown as Prisma.Decimal)
        .mul(new Prisma.Decimal('1000000'))
        .toFixed(0),
    );

    const received = BigInt(event.amountRaw);

    if (received < expectedRaw - AMOUNT_TOLERANCE) {
      const expectedHuman = this.usdc.formatUsdc(expectedRaw);
      const receivedHuman = this.usdc.formatUsdc(received);
      const reason = `Underpayment: expected ${expectedHuman} USDC, received ${receivedHuman} USDC`;

      this.logger.warn(`Payment ${payment.id}: ${reason}`);

      await this.paymentsService.failPayment(payment.id, payment.tenantId, reason);
      return;
    }

    // ── Step 4: Transition PENDING → CONFIRMING ───────────────────────────────
    await this.paymentsService.handleTxDetected({
      paymentId:   payment.id,
      txHash:      event.txHash,
      fromAddress: event.fromAddress,
      blockNumber: BigInt(event.blockNumber),
    });

    // ── Step 5: Enqueue confirmation polling ──────────────────────────────────
    // jobId = confirm:{paymentId} — BullMQ replaces any queued job with the same id.
    // This prevents duplicate polling jobs when both the listener and reconciliation
    // detect the same transfer.
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
        jobId: `confirm-${payment.id}`,
        delay: 15_000, // first check after 15 s — avoids hitting RPC before block is stable
      },
    );

    this.logger.log(
      `Payment ${payment.id} → CONFIRMING | ` +
      `tx: ${event.txHash.slice(0, 12)}… | ` +
      `amount: ${this.usdc.formatUsdc(received)} USDC | ` +
      `chain: ${event.chain}`,
    );
  }

  // ─── DLQ Escalation ───────────────────────────────────────────────────────

  @OnWorkerEvent('failed')
  async onFailed(
    job: Job<IncomingTransferJob> | undefined,
    error: Error,
  ): Promise<void> {
    if (!job) return;

    this.logger.error(
      `PaymentProcessor: job ${job.id} failed (attempt ${job.attemptsMade}/${job.opts.attempts ?? 1}): ` +
      `${error.message}`,
    );

    await this.dlqPublisher.publishIfExhausted(job, error, /* critical */ true);
  }
}
