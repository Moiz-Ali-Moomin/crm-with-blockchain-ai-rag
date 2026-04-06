/**
 * Billing Repository
 *
 * Prisma queries only — no business logic.
 * BillingInfo is excluded from auto-tenantId scoping in PrismaService,
 * so tenantId must be passed explicitly in queries.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';

@Injectable()
export class BillingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByTenantId(tenantId: string) {
    return this.prisma.billingInfo.findUnique({ where: { tenantId } });
  }

  async create(tenantId: string) {
    return this.prisma.billingInfo.create({
      data: {
        tenantId,
        plan: 'FREE',
        status: 'ACTIVE',
      },
    });
  }

  async findByPayPalSubscriptionId(paypalSubscriptionId: string) {
    return this.prisma.billingInfo.findUnique({ where: { paypalSubscriptionId } });
  }

  async update(tenantId: string, data: {
    stripeCustomerId?: string;
    stripeSubscriptionId?: string | null;
    paypalSubscriptionId?: string | null;
    plan?: string;
    status?: string;
    currentPeriodEnd?: Date | null;
    cancelAtPeriodEnd?: boolean;
    metadata?: Record<string, unknown>;
  }) {
    return this.prisma.billingInfo.update({
      where: { tenantId },
      data: data as any,
    });
  }

  async upsert(tenantId: string, data: {
    stripeCustomerId?: string;
    stripeSubscriptionId?: string | null;
    plan?: string;
    status?: string;
    currentPeriodEnd?: Date | null;
    cancelAtPeriodEnd?: boolean;
  }) {
    return this.prisma.billingInfo.upsert({
      where: { tenantId },
      create: {
        tenantId,
        plan: data.plan ?? 'FREE',
        status: data.status ?? 'ACTIVE',
        ...data,
      },
      update: data,
    });
  }
}
