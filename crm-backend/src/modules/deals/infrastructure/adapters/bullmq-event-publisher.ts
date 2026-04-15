/**
 * BullMqEventPublisher
 *
 * Implements EventPublisherPort using BullMQ queues and WsService.
 * This is the ONLY file in the Deals module allowed to touch BullMQ or WebSocket.
 *
 * Maps port method calls → concrete queue names and job structures.
 * If queue names change, only this file needs updating.
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { WsService, WS_EVENTS } from '../../../../core/websocket/ws.service';
import { QUEUE_NAMES, QUEUE_JOB_OPTIONS } from '../../../../core/queue/queue.constants';
import { EventPublisherPort } from '../../application/ports/event-publisher.port';

@Injectable()
export class BullMqEventPublisher implements EventPublisherPort {
  private readonly logger = new Logger(BullMqEventPublisher.name);

  constructor(
    private readonly ws: WsService,
    @InjectQueue(QUEUE_NAMES.AUTOMATION)   private readonly automationQueue: Queue,
    @InjectQueue(QUEUE_NAMES.NOTIFICATION) private readonly notificationQueue: Queue,
    @InjectQueue(QUEUE_NAMES.WEBHOOK_OUTBOUND) private readonly webhookQueue: Queue,
  ) {}

  async publishAutomation(
    tenantId: string,
    event: string,
    entityId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    await this.automationQueue.add(
      'evaluate',
      { tenantId, event, entityType: 'DEAL', entityId, data },
      QUEUE_JOB_OPTIONS.automation,
    );
  }

  async publishWebhook(
    tenantId: string,
    event: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.webhookQueue.add(
      'deliver',
      { tenantId, event, payload },
      QUEUE_JOB_OPTIONS.webhook,
    );
  }

  async publishNotification(payload: {
    tenantId: string;
    userId: string;
    title: string;
    body: string;
    type: string;
    entityType: string;
    entityId: string;
  }): Promise<void> {
    await this.notificationQueue.add('create', payload, QUEUE_JOB_OPTIONS.notification);
  }

  emitWebSocket(tenantId: string, wsEvent: string, data: Record<string, unknown>): void {
    try {
      this.ws.emitToTenant(tenantId, wsEvent, data);
    } catch (err) {
      // WebSocket is best-effort — never crash a request for WS failure
      this.logger.warn(`WebSocket emit failed for event ${wsEvent}: ${err}`);
    }
  }
}
