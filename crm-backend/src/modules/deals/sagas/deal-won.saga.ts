/**
 * DealWonSaga  (Choreography-based Saga)
 *
 * Orchestrates the multi-step flow that fires when a deal is marked WON:
 *
 *   Deal WON
 *     └─► Initiate payment intent
 *           └─► (success) PaymentInitiatedEvent → blockchain notarisation picks up
 *           └─► (failure) compensate: reset deal stage → CLOSING
 *
 * Design notes:
 *   - Listens to 'deal.won' via EventEmitter2 (@OnEvent decorator)
 *   - Deduplication: sagaId = correlationId ?? eventId — same event published
 *     twice starts the saga only once (SagaStateStore.exists guard)
 *   - Compensation is idempotent: sets stage to CLOSING if currently WON
 *   - Payment failure is non-fatal for blockchain (handled by its own saga step)
 *
 * Compensation matrix:
 *   ┌──────────────────────┬───────────────────────────────────────┐
 *   │ Failed step          │ Compensation action                   │
 *   ├──────────────────────┼───────────────────────────────────────┤
 *   │ createPaymentIntent  │ Reset deal stage to CLOSING           │
 *   │ Notification send    │ None — log only (non-compensable)     │
 *   └──────────────────────┴───────────────────────────────────────┘
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../core/database/prisma.service';
import { SagaStateStore } from '../../../core/saga/saga-state-store.service';
import { PaymentsService } from '../../payments/payments.service';
import { DealWonDomainEvent } from '../../../shared/events/domain-events';

@Injectable()
export class DealWonSaga {
  private readonly logger = new Logger(DealWonSaga.name);

  constructor(
    private readonly payments: PaymentsService,
    private readonly prisma: PrismaService,
    private readonly sagaStore: SagaStateStore,
  ) {}

  @OnEvent('deal.won', { async: true })
  async onDealWon(event: DealWonDomainEvent): Promise<void> {
    const sagaId = event.correlationId ?? event.eventId;

    // ── Deduplication guard ──────────────────────────────────────────────────
    const alreadyStarted = await this.sagaStore.exists(sagaId);
    if (alreadyStarted) {
      this.logger.warn(
        `DealWonSaga: saga ${sagaId} already exists — skipping duplicate event ${event.eventId}`,
      );
      return;
    }

    await this.sagaStore.start(sagaId, 'deal_won_saga', {
      dealId: event.payload.dealId,
      tenantId: event.tenantId,
      eventId: event.eventId,
    }, 'payment_pending');

    // ── Step 1: Initiate payment intent ──────────────────────────────────────
    try {
      const payment = await this.payments.createPaymentIntent(event.tenantId, {
        idempotencyKey: `deal-won:${event.payload.dealId}`,
        amountUsdc: String(event.payload.value),
        chain: 'POLYGON',
        // walletId resolved inside createPaymentIntent via tenant default wallet
        walletId: await this.resolveTenantDefaultWallet(event.tenantId),
        dealId: event.payload.dealId,
        metadata: {
          sagaId,
          correlationId: event.correlationId,
          triggeredBy: 'deal_won_saga',
        },
      });

      await this.sagaStore.advance(sagaId, 'payment_initiated', {
        paymentId: payment.id,
      });

      this.logger.log(
        `DealWonSaga: payment intent created (${payment.id}) for deal ${event.payload.dealId}`,
      );

      // Saga continues when PaymentCompletedEvent fires (in BlockchainSaga or NotificationSaga)
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `DealWonSaga: payment initiation failed for deal ${event.payload.dealId}: ${reason}`,
      );

      await this.sagaStore.markCompensating(sagaId);
      await this.compensateDeal(event, sagaId, reason);
    }
  }

  // ─── Compensation ────────────────────────────────────────────────────────────

  /**
   * Resets the deal stage back to CLOSING when payment initiation fails.
   * Idempotent: only acts if deal is still in WON status.
   */
  private async compensateDeal(
    event: DealWonDomainEvent,
    sagaId: string,
    reason: string,
  ): Promise<void> {
    try {
      await this.prisma.withoutTenantScope(async () => {
        const deal = await this.prisma.deal.findUnique({
          where: { id: event.payload.dealId },
          select: { id: true, status: true },
        });

        if (!deal || deal.status !== 'WON') {
          this.logger.warn(
            `DealWonSaga compensation: deal ${event.payload.dealId} is already ${deal?.status ?? 'gone'} — skipping`,
          );
          return;
        }

        await (this.prisma as any).deal.update({
          where: { id: event.payload.dealId },
          data: {
            status: 'OPEN',
            wonAt: null,
            // Store compensation metadata so ops team can investigate
            metadata: {
              compensation: {
                sagaId,
                reason,
                compensatedAt: new Date().toISOString(),
                originalEvent: event.eventId,
              },
            },
          },
        });
      });

      await this.sagaStore.markCompensated(sagaId);
      this.logger.warn(
        `DealWonSaga: deal ${event.payload.dealId} stage reset to ACTIVE (compensation for: ${reason})`,
      );
    } catch (compensationErr) {
      const msg = compensationErr instanceof Error ? compensationErr.message : String(compensationErr);
      // Compensation itself failed — escalate via saga store + manual intervention needed
      await this.sagaStore.fail(sagaId, `COMPENSATION_FAILED: ${msg} (original: ${reason})`);
      this.logger.error(
        `DealWonSaga: COMPENSATION FAILED for deal ${event.payload.dealId}: ${msg}`,
      );
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private async resolveTenantDefaultWallet(tenantId: string): Promise<string> {
    const wallet = await this.prisma.withoutTenantScope(() =>
      (this.prisma as any).wallet.findFirst({
        where: { tenantId, walletType: 'TENANT' },
        select: { id: true },
      }),
    );

    if (!wallet) {
      throw new Error(
        `No TENANT wallet found for tenant ${tenantId}. Provision a wallet to enable deal payment collection.`,
      );
    }

    return (wallet as any).id as string;
  }
}
