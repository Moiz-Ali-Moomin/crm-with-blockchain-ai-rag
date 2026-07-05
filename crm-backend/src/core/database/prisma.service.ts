import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { tenantContext } from './tenant-context';
import { applyTenantScope } from './tenant-scope';

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

  /**
   * All isolation logic lives in applyTenantScope (see tenant-scope.ts) so it
   * can be unit-tested exhaustively without a database.
   */
  private setupMiddleware() {
    this.$use(async (params, next) => {
      return next(applyTenantScope(params, tenantContext.getStore()));
    });
  }
}
