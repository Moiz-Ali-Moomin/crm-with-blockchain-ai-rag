/**
 * Versioned Domain Events
 *
 * Every event carries a version field. Increment the version and add a new
 * interface when the payload shape changes — never mutate an existing version.
 *
 * eventId     → UUID, used as BullMQ jobId for deduplication + idempotency
 * correlationId → propagated through the full Saga chain for distributed tracing
 * causationId   → the eventId of the parent event that caused this one
 */

import { randomUUID } from 'crypto';

// ─── Base ─────────────────────────────────────────────────────────────────────

export interface BaseEvent<T = unknown> {
  eventId: string;
  eventType: string;
  version: number;
  tenantId: string;
  actorId: string;
  occurredAt: string; // ISO-8601
  payload: T;
  correlationId?: string;
  causationId?: string;
}

// ─── Deal Domain ──────────────────────────────────────────────────────────────

export interface DealWonDomainEvent extends BaseEvent<{
  dealId: string;
  value: number;
  currency: string;
  ownerId: string;
  contactId?: string;
  pipelineId: string;
}> {
  eventType: 'deal.won';
  version: 1;
}

export interface DealLostDomainEvent extends BaseEvent<{
  dealId: string;
  lostReason?: string;
  ownerId: string;
  pipelineId: string;
}> {
  eventType: 'deal.lost';
  version: 1;
}

export interface DealStageChangedDomainEvent extends BaseEvent<{
  dealId: string;
  fromStageId: string;
  toStageId: string;
}> {
  eventType: 'deal.stage_changed';
  version: 1;
}

// ─── Payment Domain ───────────────────────────────────────────────────────────

export interface PaymentInitiatedDomainEvent extends BaseEvent<{
  paymentId: string;
  dealId?: string;
  walletId: string;
  amountUsdc: string;
  chain: string;
}> {
  eventType: 'payment.initiated';
  version: 1;
}

export interface PaymentCompletedDomainEvent extends BaseEvent<{
  paymentId: string;
  dealId?: string;
  walletId: string;
  amountUsdc: string;
  chain: string;
  txHash: string;
}> {
  eventType: 'payment.completed';
  version: 1;
}

export interface PaymentFailedDomainEvent extends BaseEvent<{
  paymentId: string;
  reason: string;
  dealId?: string;
}> {
  eventType: 'payment.failed';
  version: 1;
}

// ─── Blockchain Domain ────────────────────────────────────────────────────────

export interface BlockchainNotarisedDomainEvent extends BaseEvent<{
  entityType: string;
  entityId: string;
  txHash: string;
  blockNumber: number;
}> {
  eventType: 'blockchain.notarised';
  version: 1;
}

// ─── AI Domain ────────────────────────────────────────────────────────────────

export interface AiQueryCompletedDomainEvent extends BaseEvent<{
  queryId: string;
  tokensUsed: number;
  latencyMs: number;
  model: string;
  cached: boolean;
}> {
  eventType: 'ai.query_completed';
  version: 1;
}

// ─── Lead Domain ─────────────────────────────────────────────────────────────

export interface LeadCreatedDomainEvent extends BaseEvent<{
  leadId: string;
  source?: string;
  ownerId?: string;
}> {
  eventType: 'lead.created';
  version: 1;
}

export interface LeadConvertedDomainEvent extends BaseEvent<{
  leadId: string;
  contactId?: string;
  dealId?: string;
}> {
  eventType: 'lead.converted';
  version: 1;
}

// ─── Union ────────────────────────────────────────────────────────────────────

export type AnyDomainEvent =
  | DealWonDomainEvent
  | DealLostDomainEvent
  | DealStageChangedDomainEvent
  | PaymentInitiatedDomainEvent
  | PaymentCompletedDomainEvent
  | PaymentFailedDomainEvent
  | BlockchainNotarisedDomainEvent
  | AiQueryCompletedDomainEvent
  | LeadCreatedDomainEvent
  | LeadConvertedDomainEvent;

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createDomainEvent<T extends AnyDomainEvent>(
  partial: Omit<T, 'eventId' | 'occurredAt'>,
): T {
  return {
    ...partial,
    eventId: randomUUID(),
    occurredAt: new Date().toISOString(),
  } as T;
}
