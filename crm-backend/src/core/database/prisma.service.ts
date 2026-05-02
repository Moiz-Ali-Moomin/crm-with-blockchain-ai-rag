import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { tenantContext } from './tenant-context';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super();
  }

  async onModuleInit() {
    await this.$connect();
    this.setupMiddleware();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Bypasses tenant enforcement for the duration of the provided function.
   * Critical for registration, login, and background tasks.
   */
  async withoutTenantScope<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContext.run({ skipTenant: true }, fn);
  }

  /**
   * Runs the provided function within a specific tenant context.
   */
  async withTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    return tenantContext.run({ tenantId }, fn);
  }

  private setupMiddleware() {
    this.$use(async (params, next) => {
      const ctx = tenantContext.getStore();

      // Skip when: explicit bypass (auth/bootstrap) OR no request context at all
      // (ctx === undefined means TenantContextMiddleware didn't run, e.g. auth routes)
      if (!ctx || ctx.skipTenant) {
        return next(params);
      }

      const tenantId = ctx?.tenantId;

      // Models that MUST always be tenant-scoped
      const tenantModels = [
        'User',
        'Pipeline',
        'Stage',
        'Deal',
        'Contact',
        'Company',
      ];

      if (tenantModels.includes(params.model || '')) {
        // If no tenant context is set, block the operation
        // (Prevents accidental data leakage or cross-tenant contamination)
        if (!tenantId) {
          const requestId = (ctx as any)?.requestId || 'unknown';
          throw new Error(
            `Multi-tenancy violation: Tenant context is missing for model ${params.model} (${params.action}). RequestId: ${requestId}`,
          );
        }

        // Inject tenantId automatically into the query arguments
        if (params.action === 'create') {
          params.args = params.args || {};
          params.args.data = {
            ...(params.args.data || {}),
            tenantId,
          };
        }

        if (params.action === 'findMany' || params.action === 'findFirst') {
          params.args = params.args || {};
          params.args.where = {
            ...(params.args.where || {}),
            tenantId,
          };
        }

        if (params.action === 'update' || params.action === 'updateMany' || params.action === 'delete' || params.action === 'deleteMany') {
          params.args = params.args || {};
          params.args.where = {
            ...(params.args.where || {}),
            tenantId,
          };
        }
      }

      return next(params);
    });
  }
}
