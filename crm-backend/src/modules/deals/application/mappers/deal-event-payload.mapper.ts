/**
 * Deal Event Payload Helpers
 *
 * Pure serialisation functions that convert domain read models into plain
 * Record<string, unknown> objects safe for:
 *   - BullMQ job data (must be JSON-serialisable)
 *   - Webhook bodies
 *   - WebSocket payloads
 *
 * Design rationale:
 *   - DealReadModel contains Date objects and Prisma Decimal — not JSON-safe as-is
 *   - Using `as Record<string, unknown>` would silence the compiler but produce
 *     wrong runtime values (e.g. [object Object] for Decimal)
 *   - This explicit mapper makes the serialisation contract auditable and testable
 *   - Kept in application/ (not domain/) because it depends on DealReadModel,
 *     which is an application-layer port type, not a pure domain concept
 */

import type { DealReadModel } from '../ports/deal.repository.port';

export function toEventPayload(deal: DealReadModel): Record<string, unknown> {
  return {
    id:          deal.id,
    title:       deal.title,
    value:       String(deal.value),    // Prisma Decimal → string (preserves precision)
    currency:    deal.currency,
    status:      deal.status,
    stageId:     deal.stageId,
    pipelineId:  deal.pipelineId,
    tenantId:    deal.tenantId,
    ownerId:     deal.ownerId,
    contactId:   deal.contactId,
    companyId:   deal.companyId,
    closingDate: deal.closingDate?.toISOString() ?? null,
    wonAt:       deal.wonAt?.toISOString() ?? null,
    lostAt:      deal.lostAt?.toISOString() ?? null,
    lostReason:  deal.lostReason,
    tags:        deal.tags,
    createdAt:   deal.createdAt.toISOString(),
    updatedAt:   deal.updatedAt.toISOString(),
  };
}
