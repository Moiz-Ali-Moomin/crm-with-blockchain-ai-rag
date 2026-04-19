'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import Script from 'next/script';
import {
  CreditCard, Zap, Check, ExternalLink, AlertTriangle,
  ChevronRight, X, Shield, Smartphone, ChevronDown,
} from 'lucide-react';
import { billingApi, Plan, BillingInfo, Invoice } from '@/lib/api/billing.api';
import { queryKeys } from '@/lib/query/query-keys';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ── Razorpay types ─────────────────────────────────────────────────────────────
declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => RazorpayInstance;
  }
}
interface RazorpayOptions {
  key: string;
  subscription_id?: string;
  order_id?: string;
  amount?: number;
  currency?: string;
  name: string;
  description: string;
  theme?: { color?: string };
  handler: (response: RazorpayResponse) => void;
  modal?: { ondismiss?: () => void };
}
interface RazorpayResponse {
  razorpay_payment_id: string;
  razorpay_subscription_id?: string;
  razorpay_order_id?: string;
  razorpay_signature: string;
}
interface RazorpayInstance { open(): void; }

// ── Currency ───────────────────────────────────────────────────────────────────
type Currency = 'INR' | 'USD';

const PLAN_INR: Record<string, number> = {
  starter:    49,
  pro:        1500,
  pro_plus:   2500,
  ultimate:   4500,
};

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtDate(ts: number) {
  return new Date(ts * 1000).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    active:    'bg-emerald-50 text-emerald-700 border border-emerald-200',
    trialing:  'bg-blue-50 text-blue-700 border border-blue-200',
    past_due:  'bg-amber-50 text-amber-700 border border-amber-200',
    cancelled: 'bg-canvas-subtle text-fg-muted border border-ui-border',
  };
  return map[status] ?? 'bg-canvas-subtle text-fg-muted border border-ui-border';
}

// ── CurrencyDropdown ───────────────────────────────────────────────────────────

function CurrencyDropdown({ value, onChange }: { value: Currency; onChange: (c: Currency) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-ui-border bg-canvas text-sm font-medium text-fg-secondary hover:border-ui-border transition-colors"
      >
        <span>{value === 'INR' ? '🇮🇳 INR ₹' : '🇺🇸 USD $'}</span>
        <ChevronDown size={13} className="text-fg-subtle" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-canvas border border-ui-border rounded-xl shadow-lg z-10 min-w-[130px]">
          {(['INR', 'USD'] as Currency[]).map((c) => (
            <button
              key={c}
              onClick={() => { onChange(c); setOpen(false); }}
              className={cn(
                'w-full text-left px-4 py-2.5 text-sm hover:bg-canvas-subtle transition-colors first:rounded-t-xl last:rounded-b-xl',
                value === c ? 'text-blue-600 font-semibold' : 'text-fg-secondary',
              )}
            >
              {c === 'INR' ? '🇮🇳 INR — ₹' : '🇺🇸 USD — $'}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── PaymentMethodModal ────────────────────────────────────────────────────────

function PaymentMethodModal({
  plan, currency, razorpayLoaded, onClose, onSuccess,
}: {
  plan: Plan;
  currency: Currency;
  razorpayLoaded: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [loading, setLoading] = useState<'razorpay' | 'razorpay_order' | 'paypal' | null>(null);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const billingUrl = `${origin}/settings/billing`;

  async function handleRazorpay() {
    if (!razorpayLoaded) { toast.error('Razorpay is still loading — try again in a moment'); return; }
    setLoading('razorpay');
    try {
      const { subscriptionId, keyId } = await billingApi.createRazorpaySubscription({ planId: plan.id, billingCycle: 'monthly' });
      const rzp = new window.Razorpay({
        key: keyId,
        subscription_id: subscriptionId,
        name: 'CRM Platform',
        description: `${plan.name} — monthly`,
        theme: { color: '#2563EB' },
        handler: async (res) => {
          try {
            await billingApi.verifyRazorpayPayment({
              razorpay_payment_id: res.razorpay_payment_id,
              razorpay_subscription_id: res.razorpay_subscription_id!,
              razorpay_signature: res.razorpay_signature,
            });
            toast.success('Payment successful! Subscription activated.');
            onSuccess();
            onClose();
          } catch { toast.error('Payment verification failed. Contact support.'); }
        },
        modal: { ondismiss: () => setLoading(null) },
      });
      rzp.open();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to start Razorpay checkout');
      setLoading(null);
    }
  }

  async function handleRazorpayOrder() {
    if (!razorpayLoaded) { toast.error('Razorpay is still loading — try again in a moment'); return; }
    setLoading('razorpay_order');
    try {
      const { orderId, amount, currency: cur, keyId } = await billingApi.createRazorpayOrder({ planId: plan.id, billingCycle: 'monthly' });
      const rzp = new window.Razorpay({
        key: keyId, order_id: orderId, amount, currency: cur,
        name: 'CRM Platform', description: `${plan.name} — monthly`,
        theme: { color: '#2563EB' },
        handler: async (res) => {
          try {
            await billingApi.verifyRazorpayOrder({
              razorpay_payment_id: res.razorpay_payment_id,
              razorpay_order_id: res.razorpay_order_id!,
              razorpay_signature: res.razorpay_signature,
              planId: plan.id, billingCycle: 'monthly',
            });
            toast.success('Payment successful! Plan activated.');
            onSuccess();
            onClose();
          } catch { toast.error('Payment verification failed. Contact support.'); }
        },
        modal: { ondismiss: () => setLoading(null) },
      });
      rzp.open();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to create order');
      setLoading(null);
    }
  }

  async function handlePayPal() {
    setLoading('paypal');
    try {
      const { approvalUrl } = await billingApi.createPayPalSubscription({
        planId: plan.id, returnUrl: billingUrl, cancelUrl: billingUrl,
      });
      window.location.href = approvalUrl;
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to start PayPal checkout');
      setLoading(null);
    }
  }

  const inrPrice = PLAN_INR[plan.id];
  const displayPrice = currency === 'INR' && inrPrice
    ? `₹${inrPrice.toLocaleString('en-IN')}`
    : `$${plan.price}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-canvas border border-ui-border rounded-xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-ui-border">
          <div>
            <p className="text-xs text-fg-subtle uppercase tracking-widest mb-0.5">Upgrading to</p>
            <h3 className="text-base font-semibold text-fg">{plan.name} — {displayPrice}/mo</h3>
          </div>
          <button onClick={onClose} className="text-fg-subtle hover:text-fg p-1">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-3">
          <p className="text-sm text-fg-muted mb-4">Choose your payment method:</p>

          {currency === 'INR' ? (
            <>
              {/* Razorpay UPI AutoPay */}
              <button
                onClick={handleRazorpay}
                disabled={loading !== null}
                className="w-full flex items-center gap-4 p-4 rounded-xl border border-ui-border hover:border-blue-400 hover:shadow-sm transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center flex-shrink-0">
                  <Smartphone size={18} className="text-blue-600" />
                </div>
                <div className="text-left flex-1">
                  <p className="text-sm font-medium text-fg">UPI AutoPay / Card Mandate</p>
                  <p className="text-xs text-fg-subtle">Recurring via Razorpay · UPI, Visa, RuPay</p>
                </div>
                {loading === 'razorpay'
                  ? <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  : <ChevronRight size={16} className="text-fg-subtle group-hover:text-blue-500" />}
              </button>

              {/* Razorpay one-time */}
              <button
                onClick={handleRazorpayOrder}
                disabled={loading !== null}
                className="w-full flex items-center gap-4 p-4 rounded-xl border border-ui-border hover:border-blue-400 hover:shadow-sm transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="w-10 h-10 rounded-xl bg-canvas-subtle border border-ui-border flex items-center justify-center flex-shrink-0 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20">
                  <CreditCard size={18} className="text-blue-600" />
                </div>
                <div className="text-left flex-1">
                  <p className="text-sm font-medium text-fg">Pay Once (Card / UPI / Netbanking)</p>
                  <p className="text-xs text-fg-subtle">One-time via Razorpay · no mandate</p>
                </div>
                {loading === 'razorpay_order'
                  ? <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  : <ChevronRight size={16} className="text-fg-subtle group-hover:text-blue-500" />}
              </button>
            </>
          ) : (
            <>
              {/* PayPal */}
              <button
                onClick={handlePayPal}
                disabled={loading !== null}
                className="w-full flex items-center gap-4 p-4 rounded-xl border border-ui-border hover:border-blue-400 hover:shadow-sm transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="w-10 h-10 rounded-xl bg-canvas-subtle border border-ui-border flex items-center justify-center flex-shrink-0 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20">
                  <span className="text-blue-600 font-extrabold text-lg leading-none">P</span>
                </div>
                <div className="text-left flex-1">
                  <p className="text-sm font-medium text-fg">PayPal</p>
                  <p className="text-xs text-fg-subtle">Pay with your PayPal balance or linked bank</p>
                </div>
                {loading === 'paypal'
                  ? <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  : <ChevronRight size={16} className="text-fg-subtle group-hover:text-blue-500" />}
              </button>
            </>
          )}
        </div>

        <div className="px-6 pb-5 flex items-center gap-2">
          <Shield size={13} className="text-fg-subtle" />
          <p className="text-xs text-fg-muted">
            {currency === 'INR'
              ? '256-bit encryption · RBI compliant · Cancel anytime'
              : '256-bit encryption · PCI DSS compliant · Cancel anytime'}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── CurrentPlanCard ───────────────────────────────────────────────────────────

function CurrentPlanCard({ info, onCancel, cancelling }: {
  info: BillingInfo; onCancel: () => void; cancelling: boolean;
}) {
  const periodEnd = info.currentPeriodEnd
    ? new Date(info.currentPeriodEnd).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : null;

  const provider = info.razorpaySubscriptionId
    ? 'Razorpay'
    : info.stripeSubscriptionId
      ? 'Stripe'
      : info.paypalSubscriptionId
        ? 'PayPal'
        : null;

  return (
    <div className="bg-canvas border border-ui-border rounded-xl p-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-subtle mb-4">Current Plan</p>
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <Zap size={16} className="text-blue-600" />
            <span className="text-lg font-semibold text-fg capitalize">{info.plan}</span>
            <span className={cn('text-xs px-2 py-0.5 rounded-full capitalize', statusBadge(info.status))}>
              {info.status.replace('_', ' ')}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-fg-subtle">
            {provider && <span>via {provider}</span>}
            {periodEnd && <span>Renews {periodEnd}</span>}
            {info.cancelAtPeriodEnd && (
              <span className="flex items-center gap-1 text-amber-600">
                <AlertTriangle size={11} />
                Cancels at period end
              </span>
            )}
          </div>
        </div>
        {info.plan !== 'free' && !info.cancelAtPeriodEnd && (
          <Button
            variant="outline"
            size="sm"
            isLoading={cancelling}
            onClick={onCancel}
            className="text-rose-600 border-gray-200 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 self-start sm:self-auto"
          >
            Cancel subscription
          </Button>
        )}
      </div>
    </div>
  );
}

// ── PlanCard ──────────────────────────────────────────────────────────────────

const PLAN_HIGHLIGHT: Record<string, boolean> = { pro: true };

function PlanCard({ plan, currentPlanId, currency, onSelect }: {
  plan: Plan; currentPlanId: string; currency: Currency; onSelect: (plan: Plan) => void;
}) {
  const isCurrent = plan.id === currentPlanId.toLowerCase();
  const isHighlighted = PLAN_HIGHLIGHT[plan.id];
  const inrPrice = PLAN_INR[plan.id];

  return (
    <div className={cn(
      'relative rounded-xl border p-5 flex flex-col gap-4 transition-all',
      isCurrent
        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-sm'
        : isHighlighted
          ? 'border-blue-300 bg-canvas hover:border-blue-400 hover:shadow-sm'
          : 'border-ui-border bg-canvas hover:border-ui-border hover:shadow-sm',
    )}>
      {isHighlighted && !isCurrent && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="bg-blue-600 text-white text-xs font-semibold px-3 py-0.5 rounded-full">
            Most Popular
          </span>
        </div>
      )}
      {isCurrent && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="bg-canvas text-blue-600 text-xs font-semibold px-3 py-0.5 rounded-full border border-blue-300">
            Current Plan
          </span>
        </div>
      )}

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-subtle mb-1">{plan.name}</p>
        <div className="flex items-baseline gap-1">
          {plan.price === 0 ? (
            <span className="text-2xl font-bold text-fg">Free</span>
          ) : currency === 'INR' && inrPrice ? (
            <>
              <span className="text-2xl font-bold text-fg">₹{inrPrice.toLocaleString('en-IN')}</span>
              <span className="text-sm text-fg-subtle">/ mo</span>
            </>
          ) : (
            <>
              <span className="text-2xl font-bold text-fg">${plan.price}</span>
              <span className="text-sm text-fg-subtle">/ mo</span>
            </>
          )}
        </div>
      </div>

      <ul className="space-y-2 flex-1">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-fg-secondary">
            <Check size={14} className="text-blue-500 flex-shrink-0 mt-0.5" strokeWidth={2.5} />
            {f}
          </li>
        ))}
      </ul>

      <Button
        size="sm"
        disabled={isCurrent || plan.id === 'free'}
        onClick={() => !isCurrent && plan.id !== 'free' && onSelect(plan)}
        className={cn(
          'w-full',
          isCurrent
            ? 'bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 cursor-default hover:bg-blue-100 dark:hover:bg-blue-900/20'
            : plan.id === 'free'
              ? 'bg-canvas-subtle text-fg-subtle border border-ui-border cursor-default hover:bg-canvas-subtle'
              : 'bg-blue-600 hover:bg-blue-700 text-white',
        )}
      >
        {isCurrent ? 'Current plan' : plan.id === 'free' ? 'Free forever' : `Upgrade to ${plan.name}`}
      </Button>
    </div>
  );
}

// ── InvoiceRow ────────────────────────────────────────────────────────────────

function InvoiceRow({ invoice }: { invoice: Invoice }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-ui-border last:border-0">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-canvas-subtle border border-ui-border flex items-center justify-center flex-shrink-0">
          <CreditCard size={13} className="text-fg-subtle" />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-fg truncate">{invoice.number ?? invoice.id}</p>
          <p className="text-xs text-fg-subtle">{fmtDate(invoice.created)}</p>
        </div>
      </div>
      <div className="flex items-center gap-4 flex-shrink-0 ml-4">
        <span className="text-sm font-medium text-fg">
          ${((invoice.amount_paid || invoice.amount_due) / 100).toFixed(2)}
        </span>
        <span className={cn(
          'text-xs px-2 py-0.5 rounded-full capitalize',
          invoice.status === 'paid'
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            : 'bg-amber-50 text-amber-700 border border-amber-200',
        )}>
          {invoice.status ?? 'unknown'}
        </span>
        {invoice.invoice_pdf && (
          <a href={invoice.invoice_pdf} target="_blank" rel="noopener noreferrer"
            className="text-fg-subtle hover:text-blue-600 transition-colors">
            <ExternalLink size={14} />
          </a>
        )}
      </div>
    </div>
  );
}

// ── BillingPage ───────────────────────────────────────────────────────────────

function BillingContent() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [currency, setCurrency] = useState<Currency>('INR');
  const [razorpayLoaded, setRazorpayLoaded] = useState(false);

  // After PayPal approval, PayPal redirects back here with ?subscription_id=...
  useEffect(() => {
    const subscriptionId = searchParams.get('subscription_id');
    if (!subscriptionId) return;

    billingApi.activatePayPalSubscription({ subscriptionId })
      .then(() => {
        toast.success('PayPal subscription activated!');
        queryClient.invalidateQueries({ queryKey: queryKeys.billing.info });
      })
      .catch((err: any) => {
        toast.error(err?.response?.data?.message || 'Failed to activate PayPal subscription');
      })
      .finally(() => {
        // Remove the query param from the URL without re-navigating
        router.replace('/settings/billing');
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: info, isLoading: infoLoading } = useQuery({
    queryKey: queryKeys.billing.info,
    queryFn: billingApi.getInfo,
    retry: false,
  });

  const { data: plans = [], isLoading: plansLoading } = useQuery({
    queryKey: queryKeys.billing.plans,
    queryFn: billingApi.getPlans,
  });

  const { data: invoices = [], isLoading: invoicesLoading } = useQuery({
    queryKey: ['billing', 'invoices'],
    queryFn: billingApi.getInvoices,
    enabled: !!info?.stripeSubscriptionId,
    retry: false,
  });

  const cancelMut = useMutation({
    mutationFn: () => {
      const isRazorpay = info?.razorpaySubscriptionId || info?.razorpayPaymentId || info?.razorpayOrderId;
      if (isRazorpay)                   return billingApi.cancelRazorpaySubscription();
      if (info?.paypalSubscriptionId)   return billingApi.cancelPayPalSubscription();
      return billingApi.cancelSubscription();
    },
    onSuccess: () => {
      toast.success('Subscription cancelled. You keep access until the period ends.');
      queryClient.invalidateQueries({ queryKey: queryKeys.billing.info });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to cancel subscription');
    },
  });

  function handleCancel() {
    if (!confirm("Cancel your subscription? You'll keep access until the current period ends.")) return;
    cancelMut.mutate();
  }

  const billingInfo: BillingInfo = info ?? {
    id: '', tenantId: '',
    stripeCustomerId: null, stripeSubscriptionId: null,
    paypalSubscriptionId: null,
    razorpayCustomerId: null, razorpaySubscriptionId: null,
    razorpayPaymentId: null, razorpayOrderId: null,
    plan: 'free', status: 'active',
    currentPeriodStart: null, currentPeriodEnd: null,
    cancelAtPeriodEnd: false, metadata: {},
    createdAt: '', updatedAt: '',
  };

  const loading = infoLoading || plansLoading;

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" onLoad={() => setRazorpayLoaded(true)} />

      <div className="space-y-8 max-w-4xl">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-base font-semibold text-fg">Billing & Subscription</h1>
            <p className="text-sm text-fg-muted mt-0.5">Manage your plan, payment method, and invoices.</p>
          </div>
          <CurrencyDropdown value={currency} onChange={setCurrency} />
        </div>

        {/* Current Plan */}
        {loading ? (
          <div className="h-24 bg-shimmer rounded-xl border border-ui-border animate-pulse" />
        ) : (
          <CurrentPlanCard info={billingInfo} onCancel={handleCancel} cancelling={cancelMut.isPending} />
        )}

        {/* Plans */}
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-subtle mb-4">Plans</h2>
          {plansLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-64 bg-shimmer rounded-xl border border-ui-border animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {plans.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  currentPlanId={billingInfo.plan}
                  currency={currency}
                  onSelect={setSelectedPlan}
                />
              ))}
            </div>
          )}
        </div>

        {/* Invoices */}
        {billingInfo.stripeSubscriptionId && (
          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-subtle mb-4">Invoice History</h2>
            <div className="bg-canvas border border-ui-border rounded-xl px-4">
              {invoicesLoading ? (
                <div className="space-y-3 py-4">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-12 bg-shimmer rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : invoices.length === 0 ? (
                <p className="text-sm text-fg-muted text-center py-6">No invoices yet.</p>
              ) : (
                invoices.map((inv) => <InvoiceRow key={inv.id} invoice={inv} />)
              )}
            </div>
          </div>
        )}

        {selectedPlan && (
          <PaymentMethodModal
            plan={selectedPlan}
            currency={currency}
            razorpayLoaded={razorpayLoaded}
            onClose={() => setSelectedPlan(null)}
            onSuccess={() => queryClient.invalidateQueries({ queryKey: queryKeys.billing.info })}
          />
        )}
      </div>
    </>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<div className="h-24 bg-shimmer rounded-xl border border-ui-border animate-pulse max-w-4xl" />}>
      <BillingContent />
    </Suspense>
  );
}
