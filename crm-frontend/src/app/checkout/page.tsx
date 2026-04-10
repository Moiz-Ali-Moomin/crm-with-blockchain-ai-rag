'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CreditCard, ChevronRight, X, Shield, Bitcoin, Zap, Check, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { billingApi } from '@/lib/api/billing.api';
import { useAuthStore } from '@/store/auth.store';
import { cn } from '@/lib/utils';

// ── Plan metadata ─────────────────────────────────────────────────────────────

const PLAN_META: Record<string, { name: string; price: number; features: string[] }> = {
  starter: {
    name: 'Starter',
    price: 49,
    features: ['10 users', '5,000 contacts', 'Unlimited deals', 'Email support'],
  },
  pro: {
    name: 'Pro',
    price: 99,
    features: ['50 users', 'Unlimited contacts', 'Automation workflows', 'API access'],
  },
  pro_plus: {
    name: 'Pro Plus',
    price: 149,
    features: ['100 users', 'Unlimited contacts', 'Priority phone support', 'Advanced AI features', 'Blockchain audit trail'],
  },
  ultimate: {
    name: 'Ultimate',
    price: 499,
    features: ['Unlimited users', 'Dedicated account manager', 'Custom AI training', 'White-label option'],
  },
  enterprise: {
    name: 'Enterprise',
    price: 0,
    features: ['Custom pricing', 'Dedicated infrastructure', 'SSO / SAML', 'Custom contracts'],
  },
};

// ── CheckoutContent ───────────────────────────────────────────────────────────

function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const planId = searchParams.get('plan') ?? '';
  const billingCycle = searchParams.get('billing') === 'annual' ? 'annual' : 'monthly';
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [loading, setLoading] = useState<'stripe' | 'paypal' | null>(null);

  // Redirect to login if not authenticated, preserving the plan param
  useEffect(() => {
    if (!isAuthenticated) {
      router.replace(`/login?redirect=/checkout?plan=${planId}&billing=${billingCycle}`);
    }
  }, [isAuthenticated, planId, billingCycle, router]);

  const plan = PLAN_META[planId];

  // Unknown plan
  if (!plan) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-slate-400 mb-4">Invalid plan selected.</p>
          <Link href="/pricing" className="text-blue-400 hover:text-blue-300 text-sm underline">
            Back to pricing
          </Link>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const billingUrl = `${origin}/settings/billing`;

  async function handleStripe() {
    setLoading('stripe');
    try {
      const { url } = await billingApi.createCheckoutSession({
        plan: planId,
        successUrl: billingUrl,
        cancelUrl: `${origin}/checkout?plan=${planId}`,
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
        plan: planId,
        returnUrl: billingUrl,
        cancelUrl: `${origin}/checkout?plan=${planId}`,
      });
      window.location.href = approvalUrl;
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to start PayPal checkout');
      setLoading(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">

      {/* Nav */}
      <header className="border-b border-slate-800 bg-slate-900/95 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <Zap size={16} className="text-white" strokeWidth={2.5} />
            </div>
            <span className="text-white font-bold text-[17px] tracking-tight">CRM Platform</span>
          </Link>
          <Link
            href="/pricing"
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            <ArrowLeft size={14} />
            Back to pricing
          </Link>
        </div>
      </header>

      {/* Main */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-2 gap-8">

          {/* Left: Order summary */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-8">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6">
              Order Summary
            </p>

            {/* Plan */}
            <div className="flex items-start justify-between mb-6">
              <div>
                <p className="text-xl font-bold text-white">{plan.name}</p>
                <p className="text-sm text-slate-400 mt-0.5">
                  {billingCycle === 'annual' ? 'Billed annually · Save 20%' : 'Billed monthly'} · Cancel anytime
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-white">${plan.price}</p>
                <p className="text-xs text-slate-500">/month</p>
              </div>
            </div>

            <div className="border-t border-slate-700 mb-6" />

            {/* Features */}
            <ul className="space-y-2.5 mb-8">
              {plan.features.map((f) => (
                <li key={f} className="flex items-center gap-2.5 text-sm text-slate-300">
                  <Check size={14} className="text-blue-400 flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>

            {/* Total */}
            <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700">
              <div className="flex justify-between text-sm text-slate-400 mb-2">
                <span>{plan.name} plan (monthly)</span>
                <span>${plan.price}.00</span>
              </div>
              <div className="flex justify-between text-sm text-slate-400 mb-3">
                <span>Tax</span>
                <span>Calculated at checkout</span>
              </div>
              <div className="border-t border-slate-700 pt-3 flex justify-between font-semibold text-white">
                <span>Due today</span>
                <span>${plan.price}.00 USD</span>
              </div>
            </div>
          </div>

          {/* Right: Payment method */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6">
              Choose Payment Method
            </p>

            <div className="space-y-3">
              {/* Stripe */}
              <button
                onClick={handleStripe}
                disabled={loading !== null}
                className={cn(
                  'w-full flex items-center gap-4 p-5 rounded-xl border transition-all group',
                  'border-slate-700 hover:border-blue-600 hover:bg-slate-800/80',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center flex-shrink-0 group-hover:border-blue-600 transition-colors">
                  <CreditCard size={20} className="text-blue-400" />
                </div>
                <div className="text-left flex-1">
                  <p className="text-sm font-semibold text-white">Credit / Debit Card</p>
                  <p className="text-xs text-slate-500 mt-0.5">Visa · Mastercard · Amex · Discover</p>
                </div>
                {loading === 'stripe' ? (
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                ) : (
                  <ChevronRight size={18} className="text-slate-600 group-hover:text-blue-400 transition-colors flex-shrink-0" />
                )}
              </button>

              {/* PayPal */}
              <button
                onClick={handlePayPal}
                disabled={loading !== null}
                className={cn(
                  'w-full flex items-center gap-4 p-5 rounded-xl border transition-all group',
                  'border-slate-700 hover:border-blue-600 hover:bg-slate-800/80',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center flex-shrink-0 group-hover:border-blue-600 transition-colors">
                  <span className="text-blue-400 font-extrabold text-lg leading-none">P</span>
                </div>
                <div className="text-left flex-1">
                  <p className="text-sm font-semibold text-white">PayPal</p>
                  <p className="text-xs text-slate-500 mt-0.5">Pay with your PayPal balance or linked bank</p>
                </div>
                {loading === 'paypal' ? (
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                ) : (
                  <ChevronRight size={18} className="text-slate-600 group-hover:text-blue-400 transition-colors flex-shrink-0" />
                )}
              </button>
            </div>

            {/* Blockchain note */}
            <div className="flex items-start gap-3 p-4 rounded-xl bg-slate-800/60 border border-slate-700 mt-4">
              <Bitcoin size={15} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-slate-400 leading-relaxed">
                <span className="text-slate-300 font-medium">Blockchain audit trail included</span> — every
                payment event is cryptographically recorded on-chain at no extra cost.
              </p>
            </div>

            {/* Security */}
            <div className="flex items-center gap-2 mt-5">
              <Shield size={13} className="text-slate-600" />
              <p className="text-xs text-slate-600">256-bit encryption · PCI DSS compliant · Cancel anytime</p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

// ── Page (Suspense boundary for useSearchParams) ──────────────────────────────

export default function CheckoutPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <CheckoutContent />
    </Suspense>
  );
}
