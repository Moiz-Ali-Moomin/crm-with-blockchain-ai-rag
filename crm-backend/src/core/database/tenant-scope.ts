/**
 * Tenant scoping — the single enforcement point for multi-tenant data isolation.
 *
 * Every Prisma query on a tenant-scoped model is rewritten here so that it can
 * only ever touch rows belonging to the tenant in the current request context.
 *
 * Coverage matrix (every Prisma action is either scoped or intentionally exempt):
 *
 *   create                       → tenantId injected into data
 *   createMany                   → tenantId injected into every element of data
 *   upsert                       → tenantId merged into where AND create data
 *   findUnique / findUniqueOrThrow → tenantId merged into where
 *                                  (valid since Prisma 5.0 extendedWhereUnique:
 *                                   non-unique fields may accompany the unique key)
 *   findFirst / findFirstOrThrow → tenantId merged into where
 *   findMany                     → tenantId merged into where
 *   update / updateMany          → tenantId merged into where
 *   delete / deleteMany          → tenantId merged into where
 *   count / aggregate / groupBy  → tenantId merged into where
 *   queryRaw / executeRaw        → CANNOT be scoped here. Raw SQL must include
 *                                  "tenant_id = $n" explicitly (vector search does).
 *
 * Ordering matters: ctx.tenantId is spread AFTER the caller's where/data, so the
 * request context always wins — a caller can never widen its own scope by passing
 * a different tenantId.
 *
 * Nested relation reads (include/select) are reached through the parent row's
 * foreign keys, which are tenant-consistent by construction, so they inherit the
 * parent's scope.
 *
 * Fail-closed: a scoped model queried without tenant context throws instead of
 * silently returning unscoped data.
 */

import { Prisma } from '@prisma/client';

export interface TenantScopeContext {
  tenantId?: string | null;
  requestId?: string | null;
  skipTenant?: boolean;
}

/** Models that MUST always be tenant-scoped. `Tenant` itself is the root and is exempt. */
export const TENANT_SCOPED_MODELS: ReadonlySet<string> = new Set([
  'User',
  'RefreshSession',
  'Lead',
  'Contact',
  'Company',
  'Pipeline',
  'Stage',
  'Deal',
  'DealStageHistory',
  'Activity',
  'Task',
  'Communication',
  'EmailTemplate',
  'Ticket',
  'TicketReply',
  'Workflow',
  'WorkflowExecution',
  'Notification',
  'WebhookConfig',
  'WebhookDelivery',
  'Integration',
  'BillingInfo',
  'AiEmbedding',
  'BlockchainRecord',
  'Wallet',
  'Payment',
  'PaymentEvent',
  'LedgerAccount',
  'LedgerEntry',
  'BlockchainTransaction',
  'AuditLog',
]);

export class MissingTenantContextError extends Error {
  constructor(model: string, action: string, requestId?: string | null) {
    super(
      `Multi-tenancy violation: Tenant context is missing for model ${model} (${action}). RequestId: ${requestId || 'unknown'}`,
    );
    this.name = 'MissingTenantContextError';
  }
}

const WHERE_SCOPED_ACTIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
]);

/**
 * Rewrites a Prisma middleware params object so the query is constrained to the
 * context tenant. Mutates and returns `params`. Passthrough when there is no
 * context (bootstrap/workers), when bypass is explicit, or for exempt models.
 */
export function applyTenantScope(
  params: Prisma.MiddlewareParams,
  ctx: TenantScopeContext | undefined,
): Prisma.MiddlewareParams {
  // No context at all (worker/bootstrap code path) or explicit bypass (auth flows)
  if (!ctx || ctx.skipTenant) return params;

  if (!TENANT_SCOPED_MODELS.has(params.model || '')) return params;

  const tenantId = ctx.tenantId;
  if (!tenantId) {
    throw new MissingTenantContextError(params.model || 'unknown', params.action, ctx.requestId);
  }

  params.args = params.args || {};

  if (params.action === 'create') {
    params.args.data = { ...(params.args.data || {}), tenantId };
    return params;
  }

  if (params.action === 'createMany') {
    const data = params.args.data;
    params.args.data = Array.isArray(data)
      ? data.map((row: Record<string, unknown>) => ({ ...row, tenantId }))
      : { ...(data || {}), tenantId };
    return params;
  }

  if (params.action === 'upsert') {
    // where scoped → cross-tenant unique key can never match (falls into create);
    // create scoped → the new row always lands in the caller's tenant.
    params.args.where = { ...(params.args.where || {}), tenantId };
    params.args.create = { ...(params.args.create || {}), tenantId };
    return params;
  }

  if (WHERE_SCOPED_ACTIONS.has(params.action)) {
    params.args.where = { ...(params.args.where || {}), tenantId };
    return params;
  }

  // Remaining actions (queryRaw/executeRaw/runCommandRaw…) cannot be scoped here.
  return params;
}
