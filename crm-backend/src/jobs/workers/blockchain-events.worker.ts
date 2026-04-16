/**
 * BlockchainEventsWorker
 *
 * Processes raw Transfer events from the blockchain-events queue.
 * These events are produced by BlockchainListenerService.
 *
 * For each event:
 *   1. Check if toAddress matches any PENDING payment (by address lookup)
 *   2. If match: write a BlockchainTransaction record, transition payment → CONFIRMING
 *   3. Enqueue a confirmation polling job for the payment
 *   4. If no match: log and discard (the deposit may be to a user-controlled address
 *      outside our system, or a platform deposit we don't need to match)
 *
 * Idempotency: jobId = `transfer:${chain}:${txHash}:${logIndex}` — BullMQ prevents
 * duplicate processing if the listener replays an event on reconnect.
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

const tracer = trace.getTracer('crm-backend');

@Injectable()
@Processor(QUEUE_NAMES.BLOCKCHAIN_EVENTS, { concurrency: 5 })
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
          'blockchain.chain':       event.chain,
          'blockchain.tx_hash':     event.txHash,
          'blockchain.from_address': event.fromAddress,
          'blockchain.to_address':  event.toAddress,
          'job.name':               job.name,
        });
        try {
          await this.handleTransfer(event, job);
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

  private async handleTransfer(event: BlockchainTransferEvent, _job: Job): Promise<void> {

    this.logger.debug(
      `Processing Transfer: ${event.fromAddress} → ${event.toAddress} ` +
        `${event.amountRaw} (${event.chain}, tx: ${event.txHash.slice(0, 12)}...)`,
    );


    // 1. Match to a pending payment by destination address
    const payment = await this.paymentsService.findPendingByAddress(
      event.toAddress,
      event.chain as Chain,
    );

    if (!payment) {
      this.logger.debug(
        `No PENDING payment for address ${event.toAddress} on ${event.chain} — discarding`,
      );
      return;
    }

    // 2. Record the blockchain transaction
    await this.prisma.blockchainTransaction.upsert({
      where: { txHash: event.txHash },
      create: {
        tenantId: payment.tenantId,
        paymentId: payment.id,
        txHash: event.txHash,
        chain: event.chain as Chain,
        status: 'SUBMITTED',
        fromAddress: event.fromAddress,
        toAddress: event.toAddress,
        amountRaw: event.amountRaw,
        blockNumber: BigInt(event.blockNumber),
        firstSeenAt: new Date(),
      },
      update: {
        // Idempotent — if we've already seen this tx, don't overwrite confirmed data
      },
    });

    // 3. Validate amount matches expected (within 1 unit tolerance for rounding)
    const expectedRaw = payment.amountUsdc
      .mul(new Prisma.Decimal(1_000_000))
      .toFixed(0);

    const diff = BigInt(event.amountRaw) - BigInt(expectedRaw);
    if (diff < -1n) {
      this.logger.warn(
        `Payment ${payment.id}: received ${event.amountRaw} but expected ${expectedRaw} — underpayment, failing`,
      );
      await this.paymentsService.failPayment(
        payment.id,
        payment.tenantId,
        `Underpayment: expected ${expectedRaw}, received ${event.amountRaw}`,
      );
      return;
    }

    // 4. Transition payment to CONFIRMING
    await this.paymentsService.handleTxDetected({
      paymentId: payment.id,
      txHash: event.txHash,
      fromAddress: event.fromAddress,
      blockNumber: BigInt(event.blockNumber),
    });

    // 5. Enqueue confirmation polling (jobId deduplicates retries)
    await this.confirmationQueue.add(
      'poll_confirmations',
      {
        paymentId: payment.id,
        tenantId: payment.tenantId,
        txHash: event.txHash,
        chain: event.chain,
        targetConfirmations: payment.requiredConfirmations,
      },
      {
        ...QUEUE_JOB_OPTIONS.transactionConfirmation,
        jobId: `confirm:${payment.id}`,
        delay: 15_000, // First check after 15s (Polygon ~2s blocks, BASE ~2s)
      },
    );

    this.logger.log(
      `Payment ${payment.id} matched to tx ${event.txHash} — CONFIRMING enqueued`,
    );
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<BlockchainTransferEvent> | undefined, error: Error): Promise<void> {
    if (!job) return;
    await this.dlqPublisher.publishIfExhausted(job, error, true);
  }
}
