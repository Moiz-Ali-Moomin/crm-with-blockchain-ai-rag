/**
 * PaymentsService
 *
 * Owns the full payment lifecycle. This is the authoritative source of truth
 * for payment state — all transitions go through here.
 *
 * Responsibilities:
 *   1. Create payment intent (idempotent)
 *   2. Handle tx detection (PENDING → CONFIRMING)
 *   3. Handle confirmation threshold reached (CONFIRMING → COMPLETED)
 *   4. Expire stale PENDING intents
 *   5. Delegate ledger settlement on completion
 *   6. Fire webhook events for external consumers
 *
 * Design constraints:
 *   - All state transitions validated by PaymentStateMachine
 *   - Every transition writes a PaymentEvent row (immutable audit)
 *   - Ledger settlement inside same Prisma transaction as status update
 */

import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Chain, Payment, PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { PaymentsRepository } from './payments.repository';
import { PaymentStateMachine } from './payment-state-machine';
import { LedgerService } from '../ledger/ledger.service';
import { WalletsRepository } from '../wallets/wallets.repository';
import { QUEUE_NAMES, QUEUE_JOB_OPTIONS } from '../../core/queue/queue.constants';
import { CreatePaymentDto } from './payments.dto';
import { Cron } from '@nestjs/schedule';

// A payment intent expires if no deposit is detected within this window
const PAYMENT_EXPIRY_HOURS = 24;
// Required block confirmations before we settle
const DEFAULT_REQUIRED_CONFIRMATIONS = 3;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly paymentsRepo: PaymentsRepository,
    private readonly walletsRepo: WalletsRepository,
    private readonly ledger: LedgerService,
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.WEBHOOK_OUTBOUND) private readonly webhookQueue: Queue,
  ) {}

  // ─── Intent Creation ────────────────────────────────────────────────────────

  /**
   * Create a payment intent. Idempotent on idempotencyKey.
   * If a payment with this key already exists, returns it immediately.
   */
  async createPaymentIntent(
    tenantId: string,
    dto: CreatePaymentDto,
  ): Promise<Payment> {
    // Idempotency check — deduplication window is payment lifetime
    const existing = await this.paymentsRepo.findByIdempotencyKey(dto.idempotencyKey);
    if (existing) {
      if (existing.tenantId !== tenantId) throw new ConflictException('Idempotency key conflict');
      return existing;
    }

    const wallet = await this.walletsRepo.findById(dto.walletId, tenantId);
    if (!wallet) throw new NotFoundException(`Wallet ${dto.walletId} not found`);

    const payment = await this.paymentsRepo.create({
      tenantId,
      idempotencyKey: dto.idempotencyKey,
      direction: 'INBOUND',
      amountUsdc: new Prisma.Decimal(dto.amountUsdc),
      chain: dto.chain as Chain,
      walletId: wallet.id,
      toAddress: wallet.address, // Deposit to this wallet's address
      dealId: dto.dealId,
      expiresAt: new Date(Date.now() + PAYMENT_EXPIRY_HOURS * 60 * 60 * 1000),
      requiredConfirmations: dto.requiredConfirmations ?? DEFAULT_REQUIRED_CONFIRMATIONS,
      metadata: dto.metadata,
    });

    this.logger.log(
      `Payment intent created: ${payment.id} (${dto.amountUsdc} USDC on ${dto.chain})`,
    );

    return payment;
  }

  // ─── State Transitions (called by workers) ──────────────────────────────────

  /**
   * Called by BlockchainEventsWorker when a matching Transfer is detected.
   * Transitions PENDING → CONFIRMING and enqueues confirmation polling.
   */
  async handleTxDetected(params: {
    paymentId: string;
    txHash: string;
    fromAddress: string;
    blockNumber: bigint;
    chainTxId?: string;
  }): Promise<void> {
    // Use no-scope lookup — this is called from a worker that has no tenantId context.
    const payment = await this.paymentsRepo.findByIdNoScope(params.paymentId);
    if (!payment) {
      this.logger.warn(`handleTxDetected: payment ${params.paymentId} not found`);
      return;
    }

    if (!PaymentStateMachine.canAcceptDeposit(payment.status)) {
      this.logger.warn(
        `handleTxDetected: payment ${params.paymentId} in ${payment.status} — ignoring duplicate tx`,
      );
      return;
    }

    PaymentStateMachine.assertTransition(payment.status, 'CONFIRMING');

    await this.prisma.$transaction(async (tx) => {
      await this.paymentsRepo.transition(
        payment.id,
        'CONFIRMING',
        {
          txHash: params.txHash,
          fromAddress: params.fromAddress,
          blockNumber: params.blockNumber,
          detectedAt: new Date(),
          confirmations: 0,
        },
        tx,
      );

      await this.paymentsRepo.appendEvent(
        payment.id,
        payment.tenantId,
        payment.status,
        'CONFIRMING',
        'tx_detected',
        { txHash: params.txHash, blockNumber: params.blockNumber.toString() },
        tx,
      );
    });

    this.logger.log(`Payment ${payment.id} → CONFIRMING (tx: ${params.txHash})`);
  }

  /**
   * Called by TransactionConfirmationWorker each poll cycle.
   * Updates confirmation count. When threshold reached, settles.
   */
  async handleConfirmationUpdate(params: {
    paymentId: string;
    confirmations: number;
    currentBlockNumber: bigint;
  }): Promise<void> {
    // Use no-scope lookup — called from worker with no tenantId context.
    const payment = await this.paymentsRepo.findByIdNoScope(params.paymentId);
    if (!payment || payment.status !== 'CONFIRMING') return;

    if (params.confirmations < payment.requiredConfirmations) {
      // Not yet confirmed — just update the count
      await this.paymentsRepo.transition(
        payment.id,
        'CONFIRMING',
        { confirmations: params.confirmations },
      );
      return;
    }

    // Threshold reached — settle
    await this.settlePayment(payment);
  }

  /**
   * Internal: transition CONFIRMING → COMPLETED + write ledger entries.
   * Atomic — both happen in one Prisma transaction.
   *
   * IMPORTANT: LedgerService.settlePayment() opens its own $transaction internally.
   * To keep both operations atomic we perform them sequentially inside a single
   * outer $transaction, passing the transaction client down to both operations.
   */
  private async settlePayment(payment: Payment): Promise<void> {
    PaymentStateMachine.assertTransition(payment.status, 'COMPLETED');

    await this.prisma.$transaction(async (tx) => {
      await this.paymentsRepo.transition(
        payment.id,
        'COMPLETED',
        { confirmedAt: new Date() },
        tx,
      );

      await this.paymentsRepo.appendEvent(
        payment.id,
        payment.tenantId,
        'CONFIRMING',
        'COMPLETED',
        'payment_settled',
        {},
        tx,
      );

      // Ledger settlement: call the repo directly with the open tx client so we
      // don't open a nested $transaction (Prisma does not support nested interactive txns).
      await this.ledger.settlePaymentWithTx(
        {
          tenantId: payment.tenantId,
          walletId: payment.walletId,
          paymentId: payment.id,
          amountUsdc: payment.amountUsdc as Prisma.Decimal,
          chain: payment.chain as any,
        },
        tx,
      );
    });

    // Fire webhook (best-effort — outside the DB transaction)
    await this.webhookQueue.add(
      'deliver',
      {
        tenantId: payment.tenantId,
        event: 'PAYMENT_COMPLETED',
        payload: { paymentId: payment.id, amountUsdc: payment.amountUsdc },
      },
      QUEUE_JOB_OPTIONS.webhook,
    ).catch((err) =>
      this.logger.error(`Webhook enqueue failed for payment ${payment.id}: ${err.message}`),
    );

    this.logger.log(`Payment ${payment.id} → COMPLETED and ledger settled`);
  }

  /**
   * Transition a CONFIRMING payment to FAILED.
   * Called by TransactionConfirmationWorker — exposed as a public method so the
   * worker does not need to reach into private repository internals and bypass
   * the state machine.
   */
  async failPayment(
    paymentId: string,
    tenantId: string,
    reason: string,
  ): Promise<void> {
    const payment = await this.paymentsRepo.findByIdNoScope(paymentId);
    if (!payment) {
      this.logger.warn(`failPayment: payment ${paymentId} not found`);
      return;
    }

    if (PaymentStateMachine.isTerminal(payment.status)) {
      this.logger.warn(
        `failPayment: payment ${paymentId} already in terminal state ${payment.status} — skipping`,
      );
      return;
    }

    PaymentStateMachine.assertTransition(payment.status, 'FAILED');

    await this.prisma.$transaction(async (tx) => {
      await this.paymentsRepo.transition(
        payment.id,
        'FAILED',
        { failedAt: new Date(), failureReason: reason },
        tx,
      );
      await this.paymentsRepo.appendEvent(
        payment.id,
        payment.tenantId,
        payment.status,
        'FAILED',
        'tx_failed',
        { reason },
        tx,
      );
    });

    this.logger.warn(`Payment ${paymentId} → FAILED: ${reason}`);
  }

  /**
   * Expire all PENDING payments that have passed their expiresAt.
   * Runs automatically every 15 minutes via cron.
   */
  @Cron('*/15 * * * *')
  async expireStalePendingPayments(): Promise<number> {
    const stale = await this.paymentsRepo.findExpiredPending();
    await Promise.all(
      stale.map(async (p) => {
        await this.paymentsRepo.transition(p.id, 'EXPIRED', { failedAt: new Date() });
        await this.paymentsRepo.appendEvent(
          p.id,
          p.tenantId,
          'PENDING',
          'EXPIRED',
          'payment_expired',
        );
      }),
    );
    if (stale.length > 0) {
      this.logger.log(`Expired ${stale.length} stale PENDING payments`);
    }
    return stale.length;
  }

  // ─── Refund ─────────────────────────────────────────────────────────────────

  /**
   * Transition a COMPLETED payment to REFUNDED.
   * The state machine enforces that only COMPLETED payments can be refunded.
   * Writes an immutable audit event and fires a PAYMENT_REFUNDED webhook.
   *
   * Note: ledger reversal entries are intentionally omitted here — the
   * accounting team handles those manually via the audit trail.
   */
  async handleRefund(paymentId: string, tenantId: string, reason?: string): Promise<Payment> {
    const payment = await this.paymentsRepo.findById(paymentId, tenantId);
    if (!payment) throw new NotFoundException(`Payment ${paymentId} not found`);

    PaymentStateMachine.assertTransition(payment.status, 'REFUNDED');

    const refunded = await this.prisma.$transaction(async (tx) => {
      const updated = await this.paymentsRepo.transition(payment.id, 'REFUNDED', {}, tx);

      await this.paymentsRepo.appendEvent(
        payment.id,
        payment.tenantId,
        'COMPLETED',
        'REFUNDED',
        'payment_refunded',
        { reason: reason ?? 'Requested by tenant' },
        tx,
      );

      return updated;
    });

    // Fire webhook — best-effort, outside the DB transaction
    await this.webhookQueue
      .add(
        'deliver',
        {
          tenantId: payment.tenantId,
          event: 'PAYMENT_REFUNDED',
          payload: {
            paymentId: payment.id,
            amountUsdc: payment.amountUsdc.toString(),
            reason: reason ?? 'Requested by tenant',
          },
        },
        QUEUE_JOB_OPTIONS.webhook,
      )
      .catch((err) =>
        this.logger.error(`Webhook enqueue failed for refund ${payment.id}: ${err.message}`),
      );

    this.logger.log(`Payment ${payment.id} → REFUNDED (reason: ${reason ?? 'unspecified'})`);
    return refunded;
  }

  // ─── Reads ──────────────────────────────────────────────────────────────────

  async findById(id: string, tenantId: string): Promise<Payment> {
    const payment = await this.paymentsRepo.findById(id, tenantId);
    if (!payment) throw new NotFoundException(`Payment ${id} not found`);
    return payment;
  }

  async listByTenant(
    tenantId: string,
    opts: { status?: PaymentStatus; limit?: number; offset?: number } = {},
  ) {
    return this.paymentsRepo.listByTenant(tenantId, opts);
  }

  /** Used by the blockchain listener — find which payment an incoming tx belongs to. */
  async findPendingByAddress(toAddress: string, chain: Chain) {
    return this.paymentsRepo.findPendingByAddress(toAddress, chain);
  }

  /** Used by the confirmation worker — get all CONFIRMING payments. */
  async findAllConfirming() {
    return this.paymentsRepo.findAllConfirming();
  }
}
