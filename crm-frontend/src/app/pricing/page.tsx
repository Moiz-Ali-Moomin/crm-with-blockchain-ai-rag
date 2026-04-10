'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Minus, Zap, ArrowRight, Bitcoin, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Plan definitions ──────────────────────────────────────────────────────────

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    description: 'Start managing contacts and deals — no credit card needed.',
    monthlyPrice: 0,
    annualPrice: 0,
    ctaLabel: 'Get started free',
    ctaHref: '/register',
    ctaStyle: 'outline' as const,
    highlight: false,
  },
  {
    id: 'starter',
    name: 'Starter',
    description: 'Essential CRM tools for small sales teams getting started.',
    monthlyPrice: 49,
    annualPrice: 39,
    ctaLabel: 'Buy now',
    ctaHref: null,
    ctaStyle: 'primary' as const,
    highlight: false,
  },
  {
    id: 'pro_plus',
    name: 'Pro Plus',
    description: 'Advanced automation and AI for revenue-focused teams.',
    monthlyPrice: 149,
    annualPrice: 119,
    ctaLabel: 'Buy now',
    ctaHref: null,
    ctaStyle: 'primary' as const,
    highlight: true,
  },
  {
    id: 'ultimate',
    name: 'Ultimate',
    description: 'Maximum power, unlimited scale, and dedicated support.',
    monthlyPrice: 499,
    annualPrice: 399,
    ctaLabel: 'Buy now',
    ctaHref: null,
    ctaStyle: 'primary' as const,
    highlight: false,
  },
] as const;

type PlanId = (typeof PLANS)[number]['id'];

// ── Feature comparison table ──────────────────────────────────────────────────

type Cell = true | false | string;

interface FeatureRow {
  label: string;
  tooltip?: string;
  values: [Cell, Cell, Cell, Cell]; // free, starter, pro_plus, ultimate
}

interface FeatureSection {
  title: string;
  rows: FeatureRow[];
}

const FEATURE_SECTIONS: FeatureSection[] = [
  {
    title: 'Core CRM',
    rows: [
      { label: 'Users',                values: ['3 users',      '10 users',       '100 users',          'Unlimited'] },
      { label: 'Contacts',             values: ['500',          '5,000',          'Unlimited',          'Unlimited'] },
      { label: 'Deals',                values: ['100',          'Unlimited',      'Unlimited',          'Unlimited'] },
      { label: 'Companies',            values: [true,           true,             true,                 true] },
      { label: 'Custom fields',        values: ['5',            '25',             '100',                'Unlimited'] },
      { label: 'Mobile app',           values: [true,           true,             true,                 true] },
    ],
  },
  {
    title: 'Email & Automation',
    rows: [
      { label: 'Email integration',    values: [false,          true,             true,                 true] },
      { label: 'Email sequences',      values: [false,          '3 sequences',    'Unlimited',          'Unlimited'] },
      { label: 'Automation workflows', values: [false,          '5 workflows',    'Unlimited',          'Unlimited'] },
      { label: 'Webhooks',             values: [false,          false,            true,                 true] },
      { label: 'API access',           values: [false,          false,            true,                 true] },
    ],
  },
  {
    title: 'Analytics & Reporting',
    rows: [
      { label: 'Basic analytics',      values: [true,           true,             true,                 true] },
      { label: 'Advanced analytics',   values: [false,          false,            true,                 true] },
      { label: 'Custom reports',       values: [false,          false,            true,                 true] },
      { label: 'Revenue forecasting',  values: [false,          false,            true,                 true] },
      { label: 'Dashboard sharing',    values: [false,          false,            true,                 true] },
    ],
  },
  {
    title: 'AI Features',
    rows: [
      { label: 'AI lead scoring',      values: [false,          false,            true,                 true] },
      { label: 'AI email drafting',    values: [false,          false,            true,                 true] },
      { label: 'AI copilot chat',      values: [false,          false,            true,                 true] },
      { label: 'Custom AI training',   values: [false,          false,            false,                true] },
    ],
  },
  {
    title: 'Blockchain & Security',
    rows: [
      { label: 'Blockchain audit trail', values: [false,        false,            true,                 true] },
      { label: 'On-chain event log',   values: [false,          false,            true,                 true] },
      { label: 'SSO / SAML',           values: [false,          false,            false,                true] },
      { label: 'Custom data retention',values: [false,          false,            false,                true] },
    ],
  },
  {
    title: 'Support',
    rows: [
      { label: 'Community support',    values: [true,           true,             true,                 true] },
      { label: 'Email support',        values: [false,          true,             true,                 true] },
      { label: 'Priority phone support', values: [false,        false,            true,                 true] },
      { label: 'Dedicated account manager', values: [false,     false,            false,                true] },
      { label: 'Custom SLA',           values: [false,          false,            false,                true] },
      { label: 'White-label option',   values: [false,          false,            false,                true] },
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function CellValue({ value }: { value: Cell }) {
  if (value === true)  return <Check size={16} className="text-blue-500 mx-auto" strokeWidth={2.5} />;
  if (value === false) return <Minus size={14} className="text-slate-600 mx-auto" />;
  return <span className="text-sm text-slate-300">{value}</span>;
}

// ── PricingPage ───────────────────────────────────────────────────────────────

export default function PricingPage() {
  const router = useRouter();
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly');

  function handleCta(plan: (typeof PLANS)[number]) {
    if (plan.ctaHref) {
      router.push(plan.ctaHref);
      return;
    }
    router.push(`/checkout?plan=${plan.id}&billing=${billing}`);
  }

  const annual = billing === 'annual';

  return (
    <div className="min-h-screen bg-white text-slate-900">

      {/* ── Nav ── */}
      <header className="border-b border-slate-200 sticky top-0 z-50 bg-white/95 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <Zap size={16} className="text-white" strokeWidth={2.5} />
            </div>
            <span className="text-slate-900 font-bold text-[17px] tracking-tight">CRM Platform</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm text-slate-600">
            <Link href="/#features" className="hover:text-slate-900 transition-colors">Features</Link>
            <Link href="/pricing" className="text-blue-600 font-medium">Pricing</Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900 px-3 py-1.5 transition-colors">
              Log in
            </Link>
            <Link
              href="/register"
              className="text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-10 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 mb-4 leading-tight tracking-tight">
          CRM Platform pricing
        </h1>
        <p className="text-lg text-slate-500 max-w-xl mx-auto mb-8">
          All prices in <span className="font-semibold text-slate-700">USD</span>.
          Start free — upgrade whenever you're ready.
        </p>

        {/* Billing toggle */}
        <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-1 gap-1">
          <button
            onClick={() => setBilling('monthly')}
            className={cn(
              'px-5 py-2 rounded-md text-sm font-semibold transition-all',
              billing === 'monthly'
                ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                : 'text-slate-500 hover:text-slate-700',
            )}
          >
            Pay Monthly
          </button>
          <button
            onClick={() => setBilling('annual')}
            className={cn(
              'px-5 py-2 rounded-md text-sm font-semibold transition-all flex items-center gap-2',
              billing === 'annual'
                ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                : 'text-slate-500 hover:text-slate-700',
            )}
          >
            Pay Annually
            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
              SAVE 20%
            </span>
          </button>
        </div>
      </div>

      {/* ── Sticky plan header columns ── */}
      <div className="sticky top-16 z-40 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-5">

            {/* Empty label column */}
            <div className="py-5 pr-6" />

            {PLANS.map((plan) => (
              <div
                key={plan.id}
                className={cn(
                  'py-5 px-4 border-l border-slate-100 text-center',
                  plan.highlight && 'bg-blue-50',
                )}
              >
                {/* Plan name */}
                <p className={cn('text-xs font-bold uppercase tracking-widest mb-1', plan.highlight ? 'text-blue-600' : 'text-slate-500')}>
                  {plan.name}
                </p>

                {/* Price */}
                <div className="mb-2">
                  {plan.monthlyPrice === 0 ? (
                    <span className="text-2xl font-bold text-slate-900">Free</span>
                  ) : (
                    <div>
                      {annual && (
                        <p className="text-xs text-slate-400 line-through leading-none mb-0.5">
                          ${plan.monthlyPrice}/mo
                        </p>
                      )}
                      <div className="flex items-baseline justify-center gap-0.5">
                        <span className="text-sm text-slate-400 font-medium">$</span>
                        <span className="text-2xl font-bold text-slate-900">
                          {annual ? plan.annualPrice : plan.monthlyPrice}
                        </span>
                        <span className="text-xs text-slate-400">/mo</span>
                      </div>
                      {annual && (
                        <p className="text-[10px] text-slate-400 leading-none mt-0.5">billed annually</p>
                      )}
                    </div>
                  )}
                </div>

                {/* CTA */}
                <button
                  onClick={() => handleCta(plan)}
                  className={cn(
                    'w-full text-sm font-semibold py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1.5',
                    plan.id === 'free'
                      ? 'border border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-slate-50'
                      : plan.highlight
                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                        : 'bg-orange-500 hover:bg-orange-600 text-white',
                  )}
                >
                  {plan.ctaLabel}
                  {plan.id !== 'free' && <ArrowRight size={13} strokeWidth={2.5} />}
                </button>
              </div>
            ))}

          </div>
        </div>
      </div>

      {/* ── Plan descriptions (below sticky header) ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 border-b border-slate-100">
        <div className="grid grid-cols-5">
          <div className="py-4 pr-6" />
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={cn('py-4 px-4 border-l border-slate-100', plan.highlight && 'bg-blue-50/50')}
            >
              <p className="text-xs text-slate-500 leading-relaxed text-center">{plan.description}</p>
              {plan.highlight && (
                <p className="text-center mt-1.5">
                  <span className="inline-block text-[10px] font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full uppercase tracking-wide">
                    Most Popular
                  </span>
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Feature comparison table ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        {FEATURE_SECTIONS.map((section) => (
          <div key={section.title}>

            {/* Section header */}
            <div className="grid grid-cols-5 border-b border-slate-200 bg-slate-50">
              <div className="py-3 pr-6 col-span-1">
                <p className="text-sm font-bold text-slate-900">{section.title}</p>
              </div>
              {PLANS.map((plan) => (
                <div
                  key={plan.id}
                  className={cn('py-3 px-4 border-l border-slate-200', plan.highlight && 'bg-blue-50/60')}
                />
              ))}
            </div>

            {/* Rows */}
            {section.rows.map((row, ri) => (
              <div
                key={row.label}
                className={cn(
                  'grid grid-cols-5 border-b border-slate-100',
                  ri % 2 === 0 ? 'bg-white' : 'bg-slate-50/30',
                )}
              >
                {/* Feature label */}
                <div className="py-3.5 pr-6 flex items-center">
                  <span className="text-sm text-slate-700">{row.label}</span>
                </div>

                {/* Values per plan */}
                {row.values.map((val, pi) => (
                  <div
                    key={pi}
                    className={cn(
                      'py-3.5 px-4 border-l border-slate-100 flex items-center justify-center',
                      PLANS[pi].highlight && 'bg-blue-50/30',
                    )}
                  >
                    <CellValue value={val} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}

        {/* Sticky CTA row at bottom of table */}
        <div className="grid grid-cols-5 border border-slate-200 rounded-xl overflow-hidden mt-2 bg-slate-50">
          <div className="py-5 pr-6 flex items-center">
            <p className="text-sm font-semibold text-slate-700">Ready to get started?</p>
          </div>
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={cn('py-5 px-4 border-l border-slate-200 flex items-center justify-center', plan.highlight && 'bg-blue-50')}
            >
              <button
                onClick={() => handleCta(plan)}
                className={cn(
                  'w-full text-sm font-semibold py-2.5 px-3 rounded-lg transition-colors flex items-center justify-center gap-1.5',
                  plan.id === 'free'
                    ? 'border border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-white'
                    : plan.highlight
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'bg-orange-500 hover:bg-orange-600 text-white',
                )}
              >
                {plan.ctaLabel}
                {plan.id !== 'free' && <ArrowRight size={13} strokeWidth={2.5} />}
              </button>
            </div>
          ))}
        </div>

        {/* Enterprise row */}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 p-6 rounded-xl border border-slate-200 bg-slate-50">
          <div>
            <p className="font-bold text-slate-900 text-lg">Enterprise</p>
            <p className="text-sm text-slate-500 mt-0.5">
              Custom pricing · Unlimited everything · Dedicated infrastructure · SSO/SAML · Custom contracts
            </p>
          </div>
          <a
            href="mailto:sales@crmplatform.io"
            className="flex items-center gap-2 text-sm font-semibold bg-slate-900 hover:bg-slate-700 text-white px-6 py-2.5 rounded-lg transition-colors whitespace-nowrap flex-shrink-0"
          >
            <Phone size={14} />
            Contact sales
          </a>
        </div>
      </div>

      {/* ── Trust strip ── */}
      <div className="border-t border-slate-200 py-10 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap justify-center gap-8 text-sm text-slate-500">
            {[
              { icon: '🔒', text: '256-bit SSL encryption' },
              { icon: '✓',  text: 'PCI DSS compliant' },
              { icon: '✓',  text: 'Cancel anytime' },
              { icon: '✓',  text: 'No hidden fees' },
              { icon: '⛓',  text: 'Blockchain-verified payments' },
            ].map(({ icon, text }) => (
              <div key={text} className="flex items-center gap-2">
                <span>{icon}</span>
                {text}
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-slate-400 mt-6">
            Already have an account?{' '}
            <Link href="/login" className="text-blue-600 hover:underline">Sign in</Link>
            {' '}to manage your subscription from Settings → Billing.
          </p>
        </div>
      </div>

    </div>
  );
}
