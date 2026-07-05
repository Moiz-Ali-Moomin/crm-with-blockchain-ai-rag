/**
 * Tenant scoping — exhaustive unit tests.
 *
 * This is the single most security-critical unit in the codebase: it is the
 * only thing standing between one tenant's data and another tenant's queries.
 * Every Prisma action is asserted here so a future regression (e.g. a new
 * action slipping through unscoped) fails CI loudly.
 */

import { Prisma } from '@prisma/client';
import {
  applyTenantScope,
  MissingTenantContextError,
  TENANT_SCOPED_MODELS,
} from './tenant-scope';

const TENANT = 'tenant-aaa';
const OTHER_TENANT = 'tenant-bbb';

function makeParams(
  model: string,
  action: string,
  args: Record<string, unknown> = {},
): Prisma.MiddlewareParams {
  return {
    model,
    action,
    args,
    dataPath: [],
    runInTransaction: false,
  } as unknown as Prisma.MiddlewareParams;
}

const ctx = { tenantId: TENANT, requestId: 'req-1' };

describe('applyTenantScope', () => {
  // ── Bypass paths ──────────────────────────────────────────────────────────

  describe('bypass paths', () => {
    it('passes through untouched when there is no context (workers / bootstrap)', () => {
      const params = makeParams('Lead', 'findMany', { where: { status: 'NEW' } });
      const result = applyTenantScope(params, undefined);
      expect(result.args.where).toEqual({ status: 'NEW' });
    });

    it('passes through untouched when skipTenant is set (auth flows)', () => {
      const params = makeParams('User', 'findFirst', { where: { email: 'a@b.c' } });
      const result = applyTenantScope(params, { skipTenant: true });
      expect(result.args.where).toEqual({ email: 'a@b.c' });
    });

    it('does not scope exempt models (Tenant is the root of the hierarchy)', () => {
      const params = makeParams('Tenant', 'findUnique', { where: { id: 't1' } });
      const result = applyTenantScope(params, ctx);
      expect(result.args.where).toEqual({ id: 't1' });
    });

    it('does not scope raw queries (they must carry tenant_id in SQL)', () => {
      const params = makeParams('Lead', 'queryRaw', {});
      const result = applyTenantScope(params, ctx);
      expect(result.args).toEqual({});
    });
  });

  // ── Fail-closed ───────────────────────────────────────────────────────────

  describe('fail-closed behaviour', () => {
    it('throws when a scoped model is queried with context but no tenantId', () => {
      const params = makeParams('Lead', 'findMany');
      expect(() => applyTenantScope(params, { requestId: 'req-9' })).toThrow(
        MissingTenantContextError,
      );
    });

    it('includes model, action and requestId in the violation message', () => {
      const params = makeParams('Payment', 'delete');
      expect(() => applyTenantScope(params, { requestId: 'req-9' })).toThrow(
        /Payment.*delete.*req-9/,
      );
    });
  });

  // ── Write actions ─────────────────────────────────────────────────────────

  describe('create actions', () => {
    it('injects tenantId into create data', () => {
      const params = makeParams('Lead', 'create', { data: { email: 'x@y.z' } });
      const result = applyTenantScope(params, ctx);
      expect(result.args.data).toEqual({ email: 'x@y.z', tenantId: TENANT });
    });

    it('injects tenantId into every element of createMany data', () => {
      const params = makeParams('Activity', 'createMany', {
        data: [{ type: 'CALL' }, { type: 'EMAIL' }],
      });
      const result = applyTenantScope(params, ctx);
      expect(result.args.data).toEqual([
        { type: 'CALL', tenantId: TENANT },
        { type: 'EMAIL', tenantId: TENANT },
      ]);
    });

    it('handles createMany with a single (non-array) data object', () => {
      const params = makeParams('Activity', 'createMany', { data: { type: 'CALL' } });
      const result = applyTenantScope(params, ctx);
      expect(result.args.data).toEqual({ type: 'CALL', tenantId: TENANT });
    });

    it('overrides a caller-supplied foreign tenantId on create (context wins)', () => {
      const params = makeParams('Lead', 'create', {
        data: { email: 'x@y.z', tenantId: OTHER_TENANT },
      });
      const result = applyTenantScope(params, ctx);
      expect((result.args.data as { tenantId: string }).tenantId).toBe(TENANT);
    });

    // Services build creates in Prisma's "checked" style (relation operations
    // like createdBy: { connect }). Prisma rejects any data object that mixes
    // relation operations with scalar foreign keys, so the injection has to
    // match the caller's style.
    it('uses tenant relation connect when the data uses relation operations', () => {
      const params = makeParams('Lead', 'create', {
        data: {
          firstName: 'Ada',
          createdBy: { connect: { id: 'user-1' } },
        },
      });
      const result = applyTenantScope(params, ctx);
      expect(result.args.data).toEqual({
        firstName: 'Ada',
        createdBy: { connect: { id: 'user-1' } },
        tenant: { connect: { id: TENANT } },
      });
      expect(result.args.data).not.toHaveProperty('tenantId');
    });

    it('overrides a caller-supplied foreign tenant relation (context wins)', () => {
      const params = makeParams('Lead', 'create', {
        data: {
          firstName: 'Ada',
          createdBy: { connect: { id: 'user-1' } },
          tenant: { connect: { id: OTHER_TENANT } },
        },
      });
      const result = applyTenantScope(params, ctx);
      expect(result.args.data).toMatchObject({ tenant: { connect: { id: TENANT } } });
    });

    it('does not mistake a plain JSON column for a relation operation', () => {
      const params = makeParams('Lead', 'create', {
        data: { firstName: 'Ada', customFields: { favourite: 'blue' } },
      });
      const result = applyTenantScope(params, ctx);
      expect(result.args.data).toEqual({
        firstName: 'Ada',
        customFields: { favourite: 'blue' },
        tenantId: TENANT,
      });
    });

    it('strips relation objects from createMany rows and injects the scalar FK', () => {
      const params = makeParams('Activity', 'createMany', {
        data: [{ type: 'CALL', tenant: { connect: { id: OTHER_TENANT } } }],
      });
      const result = applyTenantScope(params, ctx);
      expect(result.args.data).toEqual([{ type: 'CALL', tenantId: TENANT }]);
    });
  });

  describe('upsert', () => {
    it('scopes both the where and the create branch', () => {
      const params = makeParams('BillingInfo', 'upsert', {
        where: { tenantId_plan: { tenantId: OTHER_TENANT, plan: 'pro' } },
        create: { plan: 'pro' },
        update: { plan: 'pro' },
      });
      const result = applyTenantScope(params, ctx);
      expect((result.args.where as { tenantId: string }).tenantId).toBe(TENANT);
      expect(result.args.create).toEqual({ plan: 'pro', tenantId: TENANT });
    });

    it('respects relation style in the create branch', () => {
      const params = makeParams('BlockchainRecord', 'upsert', {
        where: { dealId: 'deal-1' },
        create: { dealId: 'deal-1', deal: { connect: { id: 'deal-1' } } },
        update: { status: 'CONFIRMED' },
      });
      const result = applyTenantScope(params, ctx);
      expect(result.args.create).toMatchObject({ tenant: { connect: { id: TENANT } } });
      expect(result.args.create).not.toHaveProperty('tenantId');
    });
  });

  // ── Read / filter actions ─────────────────────────────────────────────────

  const whereScopedActions = [
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
  ];

  describe.each(whereScopedActions)('%s', (action) => {
    it('merges tenantId into where', () => {
      const params = makeParams('Deal', action, { where: { id: 'deal-1' } });
      const result = applyTenantScope(params, ctx);
      expect(result.args.where).toEqual({ id: 'deal-1', tenantId: TENANT });
    });

    it('creates args.where when the caller passed none', () => {
      const params = makeParams('Deal', action);
      const result = applyTenantScope(params, ctx);
      expect(result.args.where).toEqual({ tenantId: TENANT });
    });

    it('overrides a caller-supplied foreign tenantId (context wins)', () => {
      const params = makeParams('Deal', action, {
        where: { id: 'deal-1', tenantId: OTHER_TENANT },
      });
      const result = applyTenantScope(params, ctx);
      expect((result.args.where as { tenantId: string }).tenantId).toBe(TENANT);
    });
  });

  // ── Cross-tenant attack scenarios ─────────────────────────────────────────

  describe('cross-tenant access attempts', () => {
    it('findUnique by leaked primary key still gets tenant-filtered', () => {
      // Attacker knows another tenant's record id; the merged tenantId filter
      // makes the lookup return null instead of the foreign row.
      const params = makeParams('Payment', 'findUnique', {
        where: { id: 'foreign-payment-id' },
      });
      const result = applyTenantScope(params, ctx);
      expect(result.args.where).toEqual({ id: 'foreign-payment-id', tenantId: TENANT });
    });

    it('delete by leaked id is tenant-filtered', () => {
      const params = makeParams('Wallet', 'delete', { where: { id: 'foreign-wallet' } });
      const result = applyTenantScope(params, ctx);
      expect((result.args.where as { tenantId: string }).tenantId).toBe(TENANT);
    });

    it('aggregate cannot sum another tenant\'s ledger', () => {
      const params = makeParams('LedgerEntry', 'aggregate', {
        _sum: { amount: true },
        where: { accountId: 'acc-1' },
      });
      const result = applyTenantScope(params, ctx);
      expect(result.args.where).toEqual({ accountId: 'acc-1', tenantId: TENANT });
    });
  });

  // ── Model list sanity ─────────────────────────────────────────────────────

  describe('scoped model list', () => {
    it('covers the financially sensitive models', () => {
      for (const model of ['Payment', 'Wallet', 'LedgerAccount', 'LedgerEntry', 'BillingInfo']) {
        expect(TENANT_SCOPED_MODELS.has(model)).toBe(true);
      }
    });

    it('does not scope the Tenant root model', () => {
      expect(TENANT_SCOPED_MODELS.has('Tenant')).toBe(false);
    });
  });
});
