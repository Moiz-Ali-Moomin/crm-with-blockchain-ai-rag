/**
 * MoveDealStageUseCase
 *
 * The most complex and highest-value use-case in the Deals domain.
 * Replaces the sprawling `moveStage()` method in the old DealsService.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  Flow                                                               │
 * │                                                                     │
 * │  1. Load deal (404 if missing)                                      │
 * │  2. Load target stage, validate it belongs to the deal's pipeline   │
 * │  3. Call deal.transitionToStage() → domain enforces state machine   │
 * │     → emits DealWonEvent | DealLostEvent | DealStageChangedEvent    │
 * │  4. Persist updates + stage history in a single DB transaction      │
 * │  5. For WON deals:                                                  │
 * │     a. Compute deal hash (deterministic, no network) →              │
 * │        Enqueue blockchain registration job (async, non-blocking)    │
 * │     b. If USDC + wallet found → enqueue payment intent (non-fatal)  │
 * │  6. Publish automation, webhook, notification, WebSocket events     │
 * │  7. Return enriched deal read model                                 │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * Design decisions:
 *   - Domain events drive branching logic (not raw `newStage.isWon` checks)
 *   - Blockchain + payment enqueues are AFTER the transaction commit (saga pattern)
 *   - Payment failure is non-fatal: logged as WARN, does NOT roll back WON status
 *   - Blockchain failure: job persisted in BullMQ with 6 retries; PENDING record
 *     in DB enables catch-up sweep if queue enqueue itself fails
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  DEAL_REPOSITORY_PORT,
  DealRepositoryPort,
} from '../ports/deal.repository.port';
import {
  BLOCKCHAIN_PORT,
  BlockchainPort,
} from '../ports/blockchain.port';
import {
  WALLET_PORT,
  WalletPort,
} from '../ports/wallet.port';
import {
  PAYMENT_PORT,
  PaymentPort,
} from '../ports/payment.port';
import {
  EVENT_PUBLISHER_PORT,
  EventPublisherPort,
} from '../ports/event-publisher.port';
import { NotFoundError } from '../../../../shared/errors/domain.errors';
import { DealEntity } from '../../domain/entities/deal.entity';
import { StagePipelineMismatchError } from '../../domain/errors/deal.errors';
import {
  DealWonEvent,
  DealLostEvent,
  DealStageChangedEvent,
} from '../../domain/events/deal.events';
import { MoveDealStageDto } from '../../deals.dto';
import { WS_EVENTS } from '../../../../core/websocket/ws.service';
import { DealReadModel } from '../ports/deal.repository.port';
import { toEventPayload } from '../mappers/deal-event-payload.mapper';

@Injectable()
export class MoveDealStageUseCase {
  private readonly logger = new Logger(MoveDealStageUseCase.name);

  constructor(
    @Inject(DEAL_REPOSITORY_PORT)
    private readonly dealRepo: DealRepositoryPort,
    @Inject(BLOCKCHAIN_PORT)
    private readonly blockchain: BlockchainPort,
    @Inject(WALLET_PORT)
    private readonly wallets: WalletPort,
    @Inject(PAYMENT_PORT)
    private readonly payments: PaymentPort,
    @Inject(EVENT_PUBLISHER_PORT)
    private readonly events: EventPublisherPort,
  ) {}

  async execute(
    dealId: string,
    dto: MoveDealStageDto,
    actorId: string,
    tenantId: string,
  ) {
    // ── 1. Load deal ──────────────────────────────────────────────────────
    const dealRecord = await this.dealRepo.findById(dealId);
    if (!dealRecord) throw new NotFoundError('Deal', dealId);

    // ── 2. Load and validate target stage ─────────────────────────────────
    const stage = await this.dealRepo.findStageInPipeline(dto.stageId, dealRecord.pipelineId);
    if (!stage) throw new StagePipelineMismatchError(dto.stageId, dealRecord.pipelineId);

    // ── 3. Domain entity enforces state machine ───────────────────────────
    const entity = DealEntity.rehydrate({
      id:         dealRecord.id,
      title:      dealRecord.title,
      value:      Number(dealRecord.value),
      currency:   dealRecord.currency,
      status:     dealRecord.status,
      stageId:    dealRecord.stageId,
      pipelineId: dealRecord.pipelineId,
      tenantId:   dealRecord.tenantId,
      ownerId:    dealRecord.ownerId,
      wonAt:      dealRecord.wonAt,
      lostAt:     dealRecord.lostAt,
    });

    // May throw InvalidDealStateTransitionError if transition is illegal
    const { updates, events: domainEvents } = entity.transitionToStage(
      stage,
      actorId,
      dto.lostReason,
    );

    // ── 4. Persist in transaction (deal update + stage history) ───────────
    const updatedDeal = await this.dealRepo.updateInTransaction(
      dealId,
      updates,
      {
        dealId,
        tenantId,
        fromStageId: dealRecord.stageId,
        toStageId:   dto.stageId,
        movedById:   actorId,
      },
    );

    // ── 5. Process domain events ──────────────────────────────────────────
    const wonEvent   = domainEvents.find((e): e is DealWonEvent   => e instanceof DealWonEvent);
    const lostEvent  = domainEvents.find((e): e is DealLostEvent  => e instanceof DealLostEvent);
    const stageEvent = domainEvents.find((e): e is DealStageChangedEvent => e instanceof DealStageChangedEvent);

    // ── 5a. Blockchain registration (WON only) ────────────────────────────
    if (wonEvent) {
      const hashPayload = {
        tenantId,
        dealId,
        title:      updatedDeal.title,
        value:      String(updatedDeal.value),
        currency:   updatedDeal.currency,
        wonAt:      (updatedDeal.wonAt ?? new Date()).toISOString(),
        ownerId:    updatedDeal.ownerId,
        pipelineId: updatedDeal.pipelineId,
      };

      const dataHash = this.blockchain.computeDealHash(hashPayload);

      await this.blockchain.enqueueDealRegistration({
        tenantId,
        entityType:      'DEAL',
        entityId:        dealId,
        dataHash,
        payloadSnapshot: hashPayload,
      });

      this.logger.log(`Blockchain registration queued for WON deal: ${dealId}`);

      // ── 5b. Payment intent (USDC deals only, non-fatal) ─────────────────
      if (entity.isUsdcPaymentEligible()) {
        this.enqueuePaymentIntentSafely(
          tenantId,
          dealId,
          updatedDeal,
        ).catch(() => undefined); // already logged inside
      }
    }

    // ── 6. Publish automation / webhook / notifications ───────────────────
    const automationEvent = wonEvent
      ? 'DEAL_WON'
      : lostEvent
      ? 'DEAL_LOST'
      : 'DEAL_STAGE_CHANGED';

    await Promise.all([
      this.events.publishAutomation(tenantId, automationEvent, dealId, {
        deal:        toEventPayload(updatedDeal),
        fromStageId: dealRecord.stageId,
        toStageId:   dto.stageId,
      }),
      this.events.publishWebhook(tenantId, 'DEAL_UPDATED', toEventPayload(updatedDeal)),
    ]);

    if ((wonEvent || lostEvent) && updatedDeal.ownerId) {
      const isWon = !!wonEvent;
      await this.events.publishNotification({
        tenantId,
        userId:     updatedDeal.ownerId,
        title:      `Deal ${isWon ? 'Won' : 'Lost'}!`,
        body:       `${updatedDeal.title} has been marked as ${isWon ? 'Won' : 'Lost'}`,
        type:       isWon ? 'deal_won' : 'deal_lost',
        entityType: 'DEAL',
        entityId:   dealId,
      });
    }

    // ── 7. WebSocket broadcast ────────────────────────────────────────────
    const wsEvent = wonEvent
      ? WS_EVENTS.DEAL_WON
      : lostEvent
      ? WS_EVENTS.DEAL_LOST
      : WS_EVENTS.DEAL_STAGE_CHANGED;

    this.events.emitWebSocket(tenantId, wsEvent, { deal: toEventPayload(updatedDeal) });

    return updatedDeal;
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  /**
   * Attempts to enqueue a USDC payment intent when a deal is WON.
   * Non-fatal: payment failure MUST NOT roll back the WON status.
   */
  private async enqueuePaymentIntentSafely(
    tenantId: string,
    dealId: string,
    deal: DealReadModel,
  ): Promise<void> {
    try {
      const wallet = await this.wallets.findTenantWalletOnChain(
        tenantId,
        'TENANT',
        'POLYGON',
      );

      if (!wallet) {
        this.logger.warn(
          `Deal ${dealId} WON with USDC value but no TENANT wallet on POLYGON — ` +
          `provision a wallet to enable payment collection`,
        );
        return;
      }

      await this.payments.enqueuePaymentIntent({
        tenantId,
        walletId:       wallet.id,
        amountUsdc:     String(deal.value),
        chain:          'POLYGON',
        idempotencyKey: `deal-won:${dealId}`,
        dealId,
        metadata: {
          dealTitle: deal.title,
          wonAt:     deal.wonAt?.toISOString() ?? null,
        },
      });

      this.logger.log(`Payment intent queued for WON deal: ${dealId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to queue payment intent for deal ${dealId}: ${msg}`);
    }
  }
}
