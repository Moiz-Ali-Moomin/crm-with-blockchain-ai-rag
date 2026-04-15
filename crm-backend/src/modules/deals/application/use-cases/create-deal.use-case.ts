/**
 * CreateDealUseCase
 *
 * Orchestrates the creation of a new deal.
 *
 * Flow:
 *   1. Validate stage belongs to the given pipeline
 *   2. Persist the deal and initial stage history
 *   3. Fire automation + webhook events (async, non-blocking)
 *   4. Emit WebSocket broadcast
 *   5. Return the created deal read model
 *
 * Framework-independent: all infrastructure access is behind port interfaces.
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
import { StagePipelineMismatchError } from '../../domain/errors/deal.errors';
import { CreateDealDto } from '../../deals.dto';
import { WS_EVENTS } from '../../../../core/websocket/ws.service';
import { DealReadModel } from '../ports/deal.repository.port';
import { toEventPayload } from '../mappers/deal-event-payload.mapper';

@Injectable()
export class CreateDealUseCase {
  private readonly logger = new Logger(CreateDealUseCase.name);

  constructor(
    @Inject(DEAL_REPOSITORY_PORT)
    private readonly dealRepo: DealRepositoryPort,
    @Inject(EVENT_PUBLISHER_PORT)
    private readonly events: EventPublisherPort,
  ) {}

  async execute(
    dto: CreateDealDto,
    ownerId: string,
    tenantId: string,
  ) {
    // 1. Validate stage belongs to pipeline
    const stage = await this.dealRepo.findStageInPipeline(dto.stageId, dto.pipelineId);
    if (!stage) {
      throw new StagePipelineMismatchError(dto.stageId, dto.pipelineId);
    }

    // 2. Persist deal + initial stage history
    const deal = await this.dealRepo.create({
      title:        dto.title,
      value:        dto.value,
      currency:     dto.currency,
      pipelineId:   dto.pipelineId,
      stageId:      dto.stageId,
      tenantId,
      ownerId,
      contactId:    dto.contactId ?? null,
      companyId:    dto.companyId ?? null,
      closingDate:  dto.closingDate ?? null,
      description:  dto.description ?? null,
      tags:         dto.tags ?? [],
      customFields: dto.customFields ?? {},
    });

    await this.dealRepo.recordStageHistory({
      dealId:    deal.id,
      tenantId,
      toStageId: dto.stageId,
      movedById: ownerId,
    });

    // 3. Fire async side-effects (non-blocking — failures don't roll back deal creation)
    await Promise.all([
      this.events.publishAutomation(tenantId, 'DEAL_CREATED', deal.id, toEventPayload(deal)),
      this.events.publishWebhook(tenantId, 'DEAL_CREATED', toEventPayload(deal)),
    ]);

    // 4. WebSocket broadcast
    this.events.emitWebSocket(tenantId, WS_EVENTS.DEAL_CREATED, { deal: toEventPayload(deal) });

    this.logger.log(`Deal created: ${deal.id} (tenant: ${tenantId})`);

    return deal;
  }
}
