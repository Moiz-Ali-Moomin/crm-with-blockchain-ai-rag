/**
 * Billing Service
 *
 * Handles Stripe and PayPal integrations: checkout sessions, subscription
 * lifecycle, invoice retrieval, and webhook event processing.
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  BusinessRuleError,
  ExternalServiceError,
} from '../../shared/errors/domain.errors';
import Stripe from 'stripe';
import axios from 'axios';
import { BillingRepository } from './billing.repository';
import { CreateCheckoutSessionDto, CreatePayPalSubscriptionDto } from './billing.dto';

const STRIPE_PLAN_PRICE_MAP: Record<string, string | undefined> = {
  free: process.env.STRIPE_PRICE_FREE,
  starter: process.env.STRIPE_PRICE_STARTER,
  pro: process.env.STRIPE_PRICE_PRO,
  pro_plus: process.env.STRIPE_PRICE_PRO_PLUS,
  ultimate: process.env.STRIPE_PRICE_ULTIMATE,
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE,
};

const PAYPAL_PLAN_ID_MAP: Record<string, string | undefined> = {
  starter: process.env.PAYPAL_PLAN_STARTER,
  pro: process.env.PAYPAL_PLAN_PRO,
  pro_plus: process.env.PAYPAL_PLAN_PRO_PLUS,
  ultimate: process.env.PAYPAL_PLAN_ULTIMATE,
  enterprise: process.env.PAYPAL_PLAN_ENTERPRISE,
};

export const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    currency: 'usd',
    interval: null,
    features: ['Up to 3 users', '500 contacts', '100 deals', 'Basic CRM features'],
  },
  {
    id: 'starter',
    name: 'Starter',
    price: 49,
    currency: 'usd',
    interval: 'month',
    features: ['Up to 10 users', '5,000 contacts', 'Unlimited deals', 'Email integration', 'Basic analytics'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 99,
    currency: 'usd',
    interval: 'month',
    features: [
      'Up to 50 users',
      'Unlimited contacts',
      'Advanced analytics',
      'Automation workflows',
      'Webhooks',
      'API access',
    ],
  },
  {
    id: 'pro_plus',
    name: 'Pro Plus',
    price: 149,
    currency: 'usd',
    interval: 'month',
    features: [
      'Up to 100 users',
      'Unlimited contacts',
      'Everything in Pro',
      'Priority phone support',
      'Custom reporting',
      'Advanced AI features',
      'Blockchain audit trail',
    ],
  },
  {
    id: 'ultimate',
    name: 'Ultimate',
    price: 499,
    currency: 'usd',
    interval: 'month',
    features: [
      'Unlimited users',
      'Unlimited contacts & deals',
      'Dedicated account manager',
      'Custom AI model training',
      'White-label option',
      'On-premise deployment',
      'Custom SLA & contracts',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 0,
    currency: 'usd',
    interval: null,
    features: [
      'Unlimited users',
      'Dedicated infrastructure',
      'Custom integrations',
      'SSO / SAML',
      'Compliance packages',
      'Named support engineer',
      'Custom contracts',
    ],
  },
];

type BillingInfoRecord = {
  id: string;
  tenantId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  paypalSubscriptionId: string | null;
  plan: string;
  status: string;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2023-10-16',
  });

  constructor(private readonly billingRepo: BillingRepository) {}

  private normalizeBillingInfo(
    billing: Awaited<ReturnType<BillingRepository['findByTenantId']>> extends infer T
      ? NonNullable<T>
      : never,
  ): BillingInfoRecord {
    const normalized = billing as BillingInfoRecord & { paypalSubscriptionId?: string | null };

    return {
      ...normalized,
      paypalSubscriptionId: normalized.paypalSubscriptionId ?? null,
    };
  }

  async getBillingInfo(tenantId: string): Promise<BillingInfoRecord> {
    let billing = await this.billingRepo.findByTenantId(tenantId);
    if (!billing) {
      billing = await this.billingRepo.create(tenantId);
    }
    return this.normalizeBillingInfo(billing);
  }

  async getPlans() {
    return PLANS;
  }

  async createCheckoutSession(tenantId: string, dto: CreateCheckoutSessionDto) {
    if (dto.planId === 'free') {
      throw new BusinessRuleError('Cannot create a checkout session for the free plan');
    }

    const billing = await this.getBillingInfo(tenantId);

    // Get or create Stripe customer
    let stripeCustomerId = billing.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await this.stripe.customers.create({
        metadata: { tenantId },
      });
      stripeCustomerId = customer.id;
      await this.billingRepo.update(tenantId, { stripeCustomerId });
    }

    const priceId = STRIPE_PLAN_PRICE_MAP[dto.planId];
    if (!priceId) {
      throw new BusinessRuleError(`No Stripe price configured for plan: ${dto.planId}`);
    }

    const session = await this.stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: dto.successUrl,
      cancel_url: dto.returnUrl,
      metadata: { tenantId, planId: dto.planId },
    });

    return { url: session.url };
  }

  async cancelSubscription(tenantId: string) {
    const billing = await this.getBillingInfo(tenantId);

    if (!billing.stripeSubscriptionId) {
      throw new BusinessRuleError('No active subscription found');
    }

    const subscription = await this.stripe.subscriptions.update(
      billing.stripeSubscriptionId,
      { cancel_at_period_end: true },
    );

    await this.billingRepo.update(tenantId, {
      cancelAtPeriodEnd: true,
      currentPeriodEnd: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000)
        : null,
    });

    return {
      message: 'Subscription will be cancelled at the end of the billing period',
      cancelAtPeriodEnd: true,
      currentPeriodEnd: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000)
        : null,
    };
  }

  async getInvoices(tenantId: string) {
    const billing = await this.getBillingInfo(tenantId);

    if (!billing.stripeCustomerId) {
      return [];
    }

    const invoices = await this.stripe.invoices.list({
      customer: billing.stripeCustomerId,
      limit: 24,
    });

    return invoices.data.map((invoice) => ({
      id: invoice.id,
      number: invoice.number,
      status: invoice.status,
      amount: invoice.amount_paid / 100,
      currency: invoice.currency,
      date: invoice.created ? new Date(invoice.created * 1000) : null,
      pdfUrl: invoice.invoice_pdf,
      hostedUrl: invoice.hosted_invoice_url,
    }));
  }

  // ─── PayPal ────────────────────────────────────────────────────────────────

  private get paypalBaseUrl() {
    return process.env.PAYPAL_MODE === 'live'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';
  }

  private async getPayPalToken(): Promise<string> {
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const secret = process.env.PAYPAL_CLIENT_SECRET;
    if (!clientId || !secret) {
      throw new ExternalServiceError('PayPal - client credentials not configured');
    }

    const { data } = await axios.post(
      `${this.paypalBaseUrl}/v1/oauth2/token`,
      'grant_type=client_credentials',
      {
        auth: { username: clientId, password: secret },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      },
    );
    return data.access_token as string;
  }

  async createPayPalSubscription(tenantId: string, dto: CreatePayPalSubscriptionDto) {
    const paypalPlanId = PAYPAL_PLAN_ID_MAP[dto.planId];
    if (!paypalPlanId) {
      throw new BusinessRuleError(`No PayPal plan configured for: ${dto.planId}`);
    }

    const token = await this.getPayPalToken();
    const { data } = await axios.post(
      `${this.paypalBaseUrl}/v1/billing/subscriptions`,
      {
        plan_id: paypalPlanId,
        application_context: {
          return_url: dto.returnUrl,
          cancel_url: dto.cancelUrl,
          user_action: 'SUBSCRIBE_NOW',
          brand_name: 'NexusCRM',
        },
        custom_id: tenantId,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
      },
    );

    const approvalLink = data.links?.find((l: { rel: string }) => l.rel === 'approve');
    if (!approvalLink) {
      throw new ExternalServiceError('PayPal - no approval URL in response');
    }

    return {
      subscriptionId: data.id as string,
      approvalUrl: approvalLink.href as string,
    };
  }

  async cancelPayPalSubscription(tenantId: string) {
    const billing = await this.getBillingInfo(tenantId);
    if (!billing.paypalSubscriptionId) {
      throw new BusinessRuleError('No active PayPal subscription found');
    }

    const token = await this.getPayPalToken();
    await axios.post(
      `${this.paypalBaseUrl}/v1/billing/subscriptions/${billing.paypalSubscriptionId}/cancel`,
      { reason: 'Cancelled by user' },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
    );

    await this.billingRepo.update(tenantId, {
      paypalSubscriptionId: null,
      plan: 'FREE',
      status: 'CANCELLED',
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
    });

    return { message: 'PayPal subscription cancelled' };
  }

  async handlePayPalWebhook(headers: Record<string, string>, rawBody: string) {
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    if (!webhookId) {
      throw new ExternalServiceError('PayPal - webhook ID not configured');
    }

    // Verify webhook signature with PayPal
    const token = await this.getPayPalToken();
    const { data: verification } = await axios.post(
      `${this.paypalBaseUrl}/v1/notifications/verify-webhook-signature`,
      {
        auth_algo: headers['paypal-auth-algo'],
        cert_url: headers['paypal-cert-url'],
        transmission_id: headers['paypal-transmission-id'],
        transmission_sig: headers['paypal-transmission-sig'],
        transmission_time: headers['paypal-transmission-time'],
        webhook_id: webhookId,
        webhook_event: JSON.parse(rawBody),
      },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
    );

    if (verification.verification_status !== 'SUCCESS') {
      throw new BusinessRuleError('PayPal webhook signature verification failed');
    }

    const event = JSON.parse(rawBody);
    this.logger.log(`Processing PayPal event: ${event.event_type}`);

    const subscription = event.resource;
    const tenantId: string = subscription?.custom_id ?? subscription?.subscriber?.custom_id ?? '';

    switch (event.event_type) {
      case 'BILLING.SUBSCRIPTION.ACTIVATED':
        if (tenantId) {
          await this.billingRepo.upsert(tenantId, {
            paypalSubscriptionId: subscription.id,
            plan: this.getPlanFromPayPalSubscription(subscription.plan_id),
            status: 'ACTIVE',
            currentPeriodEnd: subscription.billing_info?.next_billing_time
              ? new Date(subscription.billing_info.next_billing_time)
              : null,
          });
        }
        break;

      case 'BILLING.SUBSCRIPTION.CANCELLED':
      case 'BILLING.SUBSCRIPTION.EXPIRED':
        if (tenantId) {
          await this.billingRepo.update(tenantId, {
            paypalSubscriptionId: null,
            plan: 'FREE',
            status: 'CANCELLED',
            cancelAtPeriodEnd: false,
            currentPeriodEnd: null,
          });
        }
        break;

      case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED':
        if (tenantId) {
          await this.billingRepo.update(tenantId, { status: 'PAST_DUE' });
        }
        break;

      default:
        this.logger.debug(`Unhandled PayPal event type: ${event.event_type}`);
    }

    return { received: true };
  }

  private getPlanFromPayPalSubscription(paypalPlanId: string): string {
    const entry = Object.entries(PAYPAL_PLAN_ID_MAP).find(([, id]) => id === paypalPlanId);
    return entry ? entry[0].toUpperCase() : 'PRO';
  }

  // ─── Stripe Webhook ───────────────────────────────────────────────────────

  async handleWebhook(rawBody: Buffer | undefined, signature: string) {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new ExternalServiceError('Stripe - webhook secret not configured');
    }

    if (!rawBody) {
      throw new BusinessRuleError('Raw body not available');
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Stripe webhook signature verification failed: ${message}`);
      throw new BusinessRuleError(`Webhook signature verification failed: ${message}`);
    }

    this.logger.log(`Processing Stripe event: ${event.type}`);

    try {
      switch (event.type) {
        case 'customer.subscription.created':
        case 'customer.subscription.updated': {
          const subscription = event.data.object as Stripe.Subscription;
          await this.handleSubscriptionUpdated(subscription);
          break;
        }
        case 'customer.subscription.deleted': {
          const subscription = event.data.object as Stripe.Subscription;
          await this.handleSubscriptionDeleted(subscription);
          break;
        }
        case 'invoice.payment_succeeded': {
          const invoice = event.data.object as Stripe.Invoice;
          await this.handleInvoicePaymentSucceeded(invoice);
          break;
        }
        case 'invoice.payment_failed': {
          const invoice = event.data.object as Stripe.Invoice;
          await this.handleInvoicePaymentFailed(invoice);
          break;
        }
        default:
          this.logger.debug(`Unhandled Stripe event type: ${event.type}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Error processing Stripe event ${event.type}: ${message}`);
      throw new ExternalServiceError('Stripe - failed to process webhook event');
    }

    return { received: true };
  }

  private async handleSubscriptionUpdated(subscription: Stripe.Subscription) {
    const tenantId = subscription.metadata?.tenantId;
    if (!tenantId) {
      this.logger.warn(`Subscription ${subscription.id} has no tenantId in metadata`);
      return;
    }

    const planId = this.getPlanFromSubscription(subscription);

    await this.billingRepo.upsert(tenantId, {
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: subscription.customer as string,
      plan: planId.toUpperCase(),
      status: subscription.status === 'active' ? 'ACTIVE' : subscription.status.toUpperCase(),
      currentPeriodEnd: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000)
        : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    });
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    const tenantId = subscription.metadata?.tenantId;
    if (!tenantId) return;

    await this.billingRepo.upsert(tenantId, {
      stripeSubscriptionId: null,
      plan: 'FREE',
      status: 'CANCELLED',
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
    });
  }

  private async handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
    const customerId = invoice.customer as string;
    if (!customerId) return;

    const billing = await this.billingRepo.findByTenantId(
      await this.getTenantIdByCustomer(customerId),
    );
    if (!billing) return;

    await this.billingRepo.update(billing.tenantId, { status: 'ACTIVE' });
  }

  private async handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
    const customerId = invoice.customer as string;
    if (!customerId) return;

    const tenantId = await this.getTenantIdByCustomer(customerId);
    const billing = await this.billingRepo.findByTenantId(tenantId);
    if (!billing) return;

    await this.billingRepo.update(billing.tenantId, { status: 'PAST_DUE' });
  }

  private async getTenantIdByCustomer(customerId: string): Promise<string> {
    const customer = await this.stripe.customers.retrieve(customerId);
    if (customer.deleted) return '';
    return (customer as Stripe.Customer).metadata?.tenantId ?? '';
  }

  private getPlanFromSubscription(subscription: Stripe.Subscription): string {
    const priceId = subscription.items.data[0]?.price?.id;
    if (!priceId) return 'free';

    const entry = Object.entries(STRIPE_PLAN_PRICE_MAP).find(([, id]) => id === priceId);
    return entry ? entry[0] : 'pro';
  }
}
