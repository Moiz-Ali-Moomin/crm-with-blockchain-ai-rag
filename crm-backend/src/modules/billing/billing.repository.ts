/**
 * Billing Repository
 *
 * Prisma queries only — no business logic.
 *
 * Tenant context: most callers are payment-provider webhooks (Stripe, PayPal,
 * Razorpay), which arrive without a JWT — so there is no tenant in
 * AsyncLocalStorage and the fail-closed tenant scoping would reject the query.
 * The authoritative tenantId here comes from the *signature-verified* webhook
 * payload instead, so each method explicitly establishes its tenant context
 * via prisma.withTenant(tenantId, …).
 *
 * The two provider-subscription-id lookups are the only intentional
 * cross-tenant queries: a webhook doesn't know the tenant until this lookup
 * resolves it. The key is a provider-issued unique id from a verified payload,
 * so the scope bypass cannot be steered by user input.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';

@Injectable()
export class BillingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByTenantId(tenantId: string) {
    if (!tenantId) return null;
    return this.prisma.withTenant(tenantId, () =>
      this.prisma.billingInfo.findUnique({ where: { tenantId } }),
    );
  }

  async create(tenantId: string) {
    return this.prisma.withTenant(tenantId, () =>
      this.prisma.billingInfo.create({
        data: {
          tenantId,
          plan: 'FREE',
          status: 'ACTIVE',
        },
      }),
    );
  }

  async findByPayPalSubscriptionId(paypalSubscriptionId: string) {
    // Intentional cross-tenant lookup — resolves which tenant a verified
    // PayPal webhook belongs to. See header comment.
    return this.prisma.withoutTenantScope(() =>
      this.prisma.billingInfo.findUnique({ where: { paypalSubscriptionId } as any }),
    );
  }

  async findByRazorpaySubscriptionId(razorpaySubscriptionId: string) {
    // Intentional cross-tenant lookup — resolves which tenant a verified
    // Razorpay webhook belongs to. See header comment.
    return this.prisma.withoutTenantScope(() =>
      this.prisma.billingInfo.findUnique({ where: { razorpaySubscriptionId } as any }),
    );
  }

  async update(tenantId: string, data: {
    stripeCustomerId?: string;
    stripeSubscriptionId?: string | null;
    paypalSubscriptionId?: string | null;
    razorpayCustomerId?: string | null;
    razorpaySubscriptionId?: string | null;
    razorpayPaymentId?: string | null;
    razorpayOrderId?: string | null;
    plan?: string;
    status?: string;
    currentPeriodEnd?: Date | null;
    cancelAtPeriodEnd?: boolean;
    metadata?: Record<string, unknown>;
  }) {
    return this.prisma.withTenant(tenantId, () =>
      this.prisma.billingInfo.update({
        where: { tenantId },
        data: data as any,
      }),
    );
  }

  async upsert(tenantId: string, data: {
    stripeCustomerId?: string;
    stripeSubscriptionId?: string | null;
    paypalSubscriptionId?: string | null;
    razorpayCustomerId?: string | null;
    razorpaySubscriptionId?: string | null;
    razorpayPaymentId?: string | null;
    razorpayOrderId?: string | null;
    plan?: string;
    status?: string;
    currentPeriodEnd?: Date | null;
    cancelAtPeriodEnd?: boolean;
  }) {
    return this.prisma.withTenant(tenantId, () =>
      this.prisma.billingInfo.upsert({
        where: { tenantId },
        create: {
          tenantId,
          plan: data.plan ?? 'FREE',
          status: data.status ?? 'ACTIVE',
          ...(data as any),
        },
        update: data as any,
      }),
    );
  }
}
