import { apiGet, apiPost, apiDelete } from './client';

export interface Plan {
  id: string;
  name: string;
  price: number;
  currency: string;
  interval: string | null;
  features: string[];
}

export interface BillingInfo {
  id: string;
  tenantId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  paypalSubscriptionId: string | null;
  razorpayCustomerId: string | null;
  razorpaySubscriptionId: string | null;
  razorpayPaymentId: string | null;
  razorpayOrderId: string | null;
  plan: string;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Invoice {
  id: string;
  number: string | null;
  status: string | null;
  amount_due: number;
  amount_paid: number;
  currency: string;
  created: number;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
  description: string | null;
}

export interface CheckoutSession {
  url: string;
}

export interface PayPalSubscription {
  subscriptionId: string;
  approvalUrl: string;
}

export interface CryptoPayment {
  walletAddress: string;
  currency: string;
  amount: string;
  amountUsd: number;
  planId: string;
  planName: string;
  billingCycle: string;
  paymentRef: string;
  instructions: string;
  ethPriceUsd: number | null;
}

export const billingApi = {
  getInfo: () => apiGet<BillingInfo>('/billing'),

  getPlans: () => apiGet<Plan[]>('/billing/plans'),

  getInvoices: () => apiGet<Invoice[]>('/billing/invoices'),

  // Backend expects: planId, successUrl, returnUrl
  createCheckoutSession: (data: {
    planId: string;
    successUrl: string;
    returnUrl: string;
  }) => apiPost<CheckoutSession>('/billing/checkout', data),

  cancelSubscription: () => apiPost<{ message: string }>('/billing/cancel'),

  // Backend expects: planId, returnUrl, cancelUrl
  createPayPalSubscription: (data: {
    planId: string;
    returnUrl: string;
    cancelUrl: string;
  }) => apiPost<PayPalSubscription>('/billing/paypal/subscribe', data),

  activatePayPalSubscription: (data: { subscriptionId: string }) =>
    apiPost<{ success: boolean; plan: string; status: string }>('/billing/paypal/activate', data),

  cancelPayPalSubscription: () =>
    apiPost<{ message: string }>('/billing/paypal/cancel'),

  createCryptoPayment: (data: {
    planId: string;
    currency: 'ETH' | 'USDC' | 'USDT' | 'DAI';
    billingCycle: 'monthly' | 'annual';
  }) => apiPost<CryptoPayment>('/billing/crypto/create', data),

  // ── Razorpay ──────────────────────────────────────────────────────────────

  createRazorpaySubscription: (data: {
    planId: string;
    billingCycle: 'monthly' | 'annual';
  }) => apiPost<RazorpaySubscriptionResult>('/billing/razorpay/subscribe', data),

  verifyRazorpayPayment: (data: {
    razorpay_payment_id: string;
    razorpay_subscription_id: string;
    razorpay_signature: string;
  }) => apiPost<{ success: boolean; plan: string }>('/billing/razorpay/verify', data),

  createRazorpayOrder: (data: {
    planId: string;
    billingCycle: 'monthly' | 'annual';
  }) => apiPost<RazorpayOrderResult>('/billing/razorpay/order', data),

  verifyRazorpayOrder: (data: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
    planId: string;
    billingCycle: 'monthly' | 'annual';
  }) => apiPost<{ success: boolean; plan: string }>('/billing/razorpay/verify-order', data),

  cancelRazorpaySubscription: () =>
    apiDelete<{ message: string }>('/billing/razorpay/cancel'),
};

export interface RazorpaySubscriptionResult {
  subscriptionId: string;
  status: string;
  keyId: string;
}

export interface RazorpayOrderResult {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
}
