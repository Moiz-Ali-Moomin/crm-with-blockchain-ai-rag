/**
 * EventPublisherPort
 *
 * Interface for all outbound event-publishing side-effects:
 *   - BullMQ queue jobs (automation engine, webhooks, notifications)
 *   - WebSocket tenant broadcasts
 *
 * Use-cases call this port to fire events without knowing the underlying
 * queue names, job structures, or WebSocket implementation.
 */

import { DomainEvent } from '../../domain/events/deal.events';

export const EVENT_PUBLISHER_PORT = Symbol('EVENT_PUBLISHER_PORT');

export interface DealCreatedEventData {
  tenantId: string;
  dealId: string;
  deal: Record<string, unknown>;
}

export interface DealWonEventData {
  tenantId: string;
  dealId: string;
  deal: Record<string, unknown>;
  ownerId: string | null;
  title: string;
}

export interface DealLostEventData {
  tenantId: string;
  dealId: string;
  deal: Record<string, unknown>;
  ownerId: string | null;
  title: string;
}

export interface DealStageChangedEventData {
  tenantId: string;
  dealId: string;
  deal: Record<string, unknown>;
  fromStageId: string;
  toStageId: string;
}

export interface EventPublisherPort {
  /** Fire automation engine evaluation for a deal event */
  publishAutomation(
    tenantId: string,
    event: string,
    entityId: string,
    data: Record<string, unknown>,
  ): Promise<void>;

  /** Deliver webhook for a deal event */
  publishWebhook(
    tenantId: string,
    event: string,
    payload: Record<string, unknown>,
  ): Promise<void>;

  /** Send in-app notification to a user */
  publishNotification(payload: {
    tenantId: string;
    userId: string;
    title: string;
    body: string;
    type: string;
    entityType: string;
    entityId: string;
  }): Promise<void>;

  /**
   * Emit a WebSocket event to all sockets in the tenant room.
   * `data` must be a plain object — WsService builds the envelope internally.
   */
  emitWebSocket(tenantId: string, wsEvent: string, data: Record<string, unknown>): void;
}
