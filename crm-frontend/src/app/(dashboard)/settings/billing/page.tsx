'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  CreditCard, Zap, Check, ExternalLink, AlertTriangle,
  ChevronRight, X, Shield, Bitcoin,
} from 'lucide-react';
import { billingApi, Plan, BillingInfo, Invoice } from '@/lib/api/billing.api';
import { queryKeys } from '@/lib/query/query-keys';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

// ── helpers ───────────────────────────────────────────────────────────────────

function fmt(cents: number, currency = 'usd') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
  }).format(cents / 100);
}

function fmtDate(ts: number) {
  return new Date(ts * 1000).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    active: 'bg-emerald-900/40 text-emerald-400 border border-emerald-800',
    trialing: 'bg-blue-900/40 text-blue-400 border border-blue-800',
    past_due: 'bg-amber-900/40 text-amber-400 border border-amber-800',
    cancelled: 'bg-slate-700/60 text-slate-400 border border-slate-600',
  };
  return map[status] ?? 'bg-slate-700/60 text-slate-400 border border-slate-600';
}

// ── PaymentMethodModal ────────────────────────────────────────────────────────

interface PaymentModalProps {
  plan: Plan;
  onClose: () => void;
}

function PaymentMethodModal({ plan, onClose }: PaymentModalProps) {
  const [loading, setLoading] = useState<'stripe' | 'paypal' | null>(null);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const billingUrl = `${origin}/settings/billing`;

  async function handleStripe() {
    setLoading('stripe');
    try {
      const { url } = await billingApi.createCheckoutSession({
        planId: plan.id,
        successUrl: billingUrl,
        returnUrl: billingUrl,
      });
      window.location.href = url;
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to start Stripe checkout');
      setLoading(null);
    }
  }

  async function handlePayPal() {
    setLoading('paypal');
    try {
      const { approvalUrl } = await billingApi.createPayPalSubscription({
        planId: plan.id,
        returnUrl: billingUrl,
        cancelUrl: billingUrl,
      });
      window.location.href = approvalUrl;
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to start PayPal checkout');
      setLoading(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-0.5">Upgrading to</p>
            <h3 className="text-base font-semibold text-white">
              {plan.name} — ${plan.price}/mo
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 transition-colors p-1"
          >
            <X size={18} />
          </button>
        </div>

        {/* Payment options */}
        <div className="p-6 space-y-3">
          <p className="text-sm text-slate-400 mb-4">Choose your payment method:</p>

          {/* Stripe */}
          <button
            onClick={handleStripe}
            disabled={loading !== null}
            className="w-full flex items-center gap-4 p-4 rounded-lg border border-slate-700 hover:border-blue-600 hover:bg-slate-800 transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center flex-shrink-0 group-hover:border-blue-600 transition-colors">
              <CreditCard size={18} className="text-blue-400" />
            </div>
            <div className="text-left flex-1">
              <p className="text-sm font-medium text-white">Credit / Debit Card</p>
              <p className="text-xs text-slate-500">Powered by Stripe · Visa, Mastercard, Amex</p>
            </div>
            {loading === 'stripe' ? (
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              <ChevronRight size={16} className="text-slate-600 group-hover:text-blue-400 transition-colors" />
            )}
          </button>

          {/* PayPal */}
          <button
            onClick={handlePayPal}
            disabled={loading !== null}
            className="w-full flex items-center gap-4 p-4 rounded-lg border border-slate-700 hover:border-blue-600 hover:bg-slate-800 transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center flex-shrink-0 group-hover:border-blue-600 transition-colors">
              {/* PayPal P icon */}
              <span className="text-blue-400 font-bold text-sm leading-none">P</span>
            </div>
            <div className="text-left flex-1">
              <p className="text-sm font-medium text-white">PayPal</p>
              <p className="text-xs text-slate-500">Pay with your PayPal balance or linked bank</p>
            </div>
            {loading === 'paypal' ? (
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              <ChevronRight size={16} className="text-slate-600 group-hover:text-blue-400 transition-colors" />
            )}
          </button>

          {/* Blockchain note */}
          <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/60 border border-slate-700 mt-2">
            <Bitcoin size={15} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-slate-400 leading-relaxed">
              <span className="text-slate-300 font-medium">Blockchain audit trail</span> is automatically
              enabled on all plans — every payment and subscription event is
              cryptographically recorded on-chain at no extra cost.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 flex items-center gap-2">
          <Shield size={13} className="text-slate-600" />
          <p className="text-xs text-slate-600">256-bit encryption · PCI DSS compliant · Cancel anytime</p>
        </div>
      </div>
    </div>
  );
}

// ── CurrentPlanCard ───────────────────────────────────────────────────────────

interface CurrentPlanCardProps {
  info: BillingInfo;
  onCancel: () => void;
  cancelling: boolean;
}

function CurrentPlanCard({ info, onCancel, cancelling }: CurrentPlanCardProps) {
  const periodEnd = info.currentPeriodEnd
    ? new Date(info.currentPeriodEnd).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : null;

  const provider = info.stripeSubscriptionId
    ? 'Stripe'
    : info.paypalSubscriptionId
      ? 'PayPal'
      : null;

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm text-slate-400 font-medium uppercase tracking-wide">Current Plan</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <Zap size={16} className="text-blue-400" />
              <span className="text-lg font-semibold text-white capitalize">{info.plan}</span>
              <span className={cn('text-xs px-2 py-0.5 rounded-full capitalize', statusBadge(info.status))}>
                {info.status.replace('_', ' ')}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
              {provider && <span>via {provider}</span>}
              {periodEnd && <span>Renews {periodEnd}</span>}
              {info.cancelAtPeriodEnd && (
                <span className="flex items-center gap-1 text-amber-400">
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
              className="text-red-400 border-slate-700 hover:border-red-800 hover:bg-red-950/30 hover:text-red-300 self-start sm:self-auto"
            >
              Cancel subscription
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── PlanCard ──────────────────────────────────────────────────────────────────

interface PlanCardProps {
  plan: Plan;
  currentPlanId: string;
  onSelect: (plan: Plan) => void;
}

const PLAN_HIGHLIGHT: Record<string, boolean> = { pro: true };

function PlanCard({ plan, currentPlanId, onSelect }: PlanCardProps) {
  const isCurrent = plan.id === currentPlanId;
  const isHighlighted = PLAN_HIGHLIGHT[plan.id];

  return (
    <div
      className={cn(
        'relative rounded-xl border p-5 flex flex-col gap-4 transition-all',
        isCurrent
          ? 'border-blue-600 bg-blue-950/20'
          : isHighlighted
            ? 'border-blue-700/60 bg-slate-800/70 hover:border-blue-600'
            : 'border-slate-700 bg-slate-800/40 hover:border-slate-600',
      )}
    >
      {isHighlighted && !isCurrent && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="bg-blue-600 text-white text-xs font-semibold px-3 py-0.5 rounded-full">
            Most Popular
          </span>
        </div>
      )}

      {isCurrent && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="bg-slate-700 text-slate-300 text-xs font-semibold px-3 py-0.5 rounded-full border border-slate-600">
            Current Plan
          </span>
        </div>
      )}

      {/* Plan name & price */}
      <div>
        <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">{plan.name}</p>
        <div className="flex items-baseline gap-1">
          {plan.price === 0 ? (
            <span className="text-2xl font-bold text-white">Free</span>
          ) : (
            <>
              <span className="text-2xl font-bold text-white">${plan.price}</span>
              <span className="text-sm text-slate-500">/ mo</span>
            </>
          )}
        </div>
      </div>

      {/* Features */}
      <ul className="space-y-2 flex-1">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-slate-300">
            <Check size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />
            {f}
          </li>
        ))}
      </ul>

      {/* CTA */}
      <Button
        size="sm"
        disabled={isCurrent || plan.id === 'free'}
        onClick={() => !isCurrent && plan.id !== 'free' && onSelect(plan)}
        className={cn(
          'w-full transition-all',
          isCurrent
            ? 'bg-blue-900/40 text-blue-300 border border-blue-800 cursor-default'
            : plan.id === 'free'
              ? 'bg-slate-700/40 text-slate-500 border border-slate-700 cursor-default'
              : 'bg-blue-600 hover:bg-blue-500 text-white',
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
    <div className="flex items-center justify-between py-3 border-b border-slate-800 last:border-0">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center flex-shrink-0">
          <CreditCard size={13} className="text-slate-400" />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-slate-200 truncate">
            {invoice.number ?? invoice.id}
          </p>
          <p className="text-xs text-slate-500">{fmtDate(invoice.created)}</p>
        </div>
      </div>

      <div className="flex items-center gap-4 flex-shrink-0 ml-4">
        <span className="text-sm font-medium text-white">
          {fmt(invoice.amount_paid || invoice.amount_due, invoice.currency)}
        </span>

        <span className={cn(
          'text-xs px-2 py-0.5 rounded-full capitalize',
          invoice.status === 'paid'
            ? 'bg-emerald-900/40 text-emerald-400 border border-emerald-800'
            : 'bg-amber-900/40 text-amber-400 border border-amber-800',
        )}>
          {invoice.status ?? 'unknown'}
        </span>

        {invoice.invoice_pdf && (
          <a
            href={invoice.invoice_pdf}
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-500 hover:text-blue-400 transition-colors"
          >
            <ExternalLink size={14} />
          </a>
        )}
      </div>
    </div>
  );
}

// ── BillingPage ───────────────────────────────────────────────────────────────

export default function BillingPage() {
  const queryClient = useQueryClient();
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);

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
      const provider = info?.paypalSubscriptionId ? 'paypal' : 'stripe';
      return provider === 'paypal'
        ? billingApi.cancelPayPalSubscription()
        : billingApi.cancelSubscription();
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

  // ── fallback billing info for new tenants (no billing record yet) ──────────
  const billingInfo: BillingInfo = info ?? {
    id: '',
    tenantId: '',
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    paypalSubscriptionId: null,
    razorpayCustomerId: null,
    razorpaySubscriptionId: null,
    razorpayPaymentId: null,
    razorpayOrderId: null,
    plan: 'free',
    status: 'active',
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    metadata: {},
    createdAt: '',
    updatedAt: '',
  };

  const loading = infoLoading || plansLoading;

  return (
    <div className="space-y-8 max-w-4xl">

      {/* Header */}
      <div>
        <h1 className="text-base font-semibold text-white">Billing & Subscription</h1>
        <p className="text-sm text-slate-500 mt-0.5">Manage your plan, payment method, and invoices.</p>
      </div>

      {/* Current Plan */}
      {loading ? (
        <div className="h-24 bg-slate-800/50 rounded-xl border border-slate-700 animate-pulse" />
      ) : (
        <CurrentPlanCard
          info={billingInfo}
          onCancel={handleCancel}
          cancelling={cancelMut.isPending}
        />
      )}

      {/* Plans */}
      <div>
        <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-4">Plans</h2>
        {plansLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-64 bg-slate-800/50 rounded-xl border border-slate-700 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                currentPlanId={billingInfo.plan}
                onSelect={setSelectedPlan}
              />
            ))}
          </div>
        )}
      </div>

      {/* Invoices */}
      {billingInfo.stripeSubscriptionId && (
        <div>
          <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-4">Invoice History</h2>
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="pt-4">
              {invoicesLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-12 bg-slate-700/40 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : invoices.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-6">No invoices yet.</p>
              ) : (
                <div>
                  {invoices.map((inv) => (
                    <InvoiceRow key={inv.id} invoice={inv} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Payment method modal */}
      {selectedPlan && (
        <PaymentMethodModal
          plan={selectedPlan}
          onClose={() => setSelectedPlan(null)}
        />
      )}
    </div>
  );
}
