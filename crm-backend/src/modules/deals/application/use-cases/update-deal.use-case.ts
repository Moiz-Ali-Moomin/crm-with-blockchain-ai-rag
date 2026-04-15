/**
 * UpdateDealUseCase
 *
 * Updates mutable fields of an existing deal (does NOT handle stage moves).
 * Stage changes go through MoveDealStageUseCase to enforce the state machine.
 *
 * Flow:
 *   1. Verify deal exists
 *   2. Persist field updates
 *   3. Publish webhook event
 *   4. Return updated deal
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  DEAL_REPOSITORY_PORT,
  DealRepositoryPort,
} from '../ports/deal.repository.port';
import {
  EVENT_PUBLISHER_PORT,
  EventPublisherPort,
} from '../ports/event-publisher.port';
import { NotFoundError } from '../../../../shared/errors/domain.errors';
import { UpdateDealDto } from '../../deals.dto';
import { DealReadModel } from '../ports/deal.repository.port';
import { toEventPayload } from '../mappers/deal-event-payload.mapper';


@Injectable()
export class UpdateDealUseCase {
  private readonly logger = new Logger(UpdateDealUseCase.name);

  constructor(
    @Inject(DEAL_REPOSITORY_PORT)
    private readonly dealRepo: DealRepositoryPort,
    @Inject(EVENT_PUBLISHER_PORT)
    private readonly events: EventPublisherPort,
  ) {}

  async execute(id: string, dto: UpdateDealDto, tenantId: string) {
    // 1. Guard: deal must exist
    const existing = await this.dealRepo.findById(id);
    if (!existing) throw new NotFoundError('Deal', id);

    // 2. Persist updates
    const updated = await this.dealRepo.update(id, dto as any);

    // 3. Async side-effects (non-blocking)
    this.events
      .publishWebhook(tenantId, 'DEAL_UPDATED', toEventPayload(updated))
      .catch((err: Error) =>
        this.logger.error(`Webhook publish failed for deal ${id}: ${err.message}`),
      );

    this.logger.log(`Deal updated: ${id}`);

    return updated;
  }
}
