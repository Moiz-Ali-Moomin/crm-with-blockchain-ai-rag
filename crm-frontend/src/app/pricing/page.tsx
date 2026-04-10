'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Minus, Zap, ArrowRight, Phone } from 'lucide-react';
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
    highlight: false,
    badge: null,
    features: [
      '3 users',
      '500 contacts',
      '100 deals',
      'Basic analytics',
      'Community support',
      'Mobile app',
    ],
  },
  {
    id: 'starter',
    name: 'Starter',
    description: 'Essential CRM tools for small sales teams getting started.',
    monthlyPrice: 49,
    annualPrice: 39,
    ctaLabel: 'Buy now',
    ctaHref: null,
    highlight: false,
    badge: null,
    features: [
      '10 users',
      '5,000 contacts',
      'Unlimited deals',
      'Email integration',
      '5 automation workflows',
      'Basic analytics',
      'Email support',
    ],
  },
  {
    id: 'pro_plus',
    name: 'Pro Plus',
    description: 'Advanced automation and AI for revenue-focused teams.',
    monthlyPrice: 149,
    annualPrice: 119,
    ctaLabel: 'Buy now',
    ctaHref: null,
    highlight: true,
    badge: 'Most Popular',
    features: [
      '100 users',
      'Unlimited contacts & deals',
      'Unlimited automation workflows',
      'Advanced analytics & custom reports',
      'AI lead scoring & email drafting',
      'Blockchain audit trail',
      'Webhooks & API access',
      'Priority phone support',
    ],
  },
  {
    id: 'ultimate',
    name: 'Ultimate',
    description: 'Maximum power, unlimited scale, and dedicated support.',
    monthlyPrice: 499,
    annualPrice: 399,
    ctaLabel: 'Buy now',
    ctaHref: null,
    highlight: false,
    badge: 'Best Value',
    features: [
      'Unlimited users',
      'Unlimited contacts & deals',
      'Everything in Pro Plus',
      'Custom AI model training',
      'White-label option',
      'On-premise deployment',
      'Dedicated account manager',
      'Custom SLA & contracts',
      'SSO / SAML',
    ],
  },
] as const;

// ── Feature comparison table (desktop) ───────────────────────────────────────

type Cell = true | false | string;

interface FeatureRow {
  label: string;
  values: [Cell, Cell, Cell, Cell];
}

interface FeatureSection {
  title: string;
  rows: FeatureRow[];
}

const FEATURE_SECTIONS: FeatureSection[] = [
  {
    title: 'Core CRM',
    rows: [
      { label: 'Users',                values: ['3 users',      '10 users',       '100 users',     'Unlimited'] },
      { label: 'Contacts',             values: ['500',          '5,000',          'Unlimited',     'Unlimited'] },
      { label: 'Deals',                values: ['100',          'Unlimited',      'Unlimited',     'Unlimited'] },
      { label: 'Custom fields',        values: ['5',            '25',             '100',           'Unlimited'] },
      { label: 'Mobile app',           values: [true,           true,             true,            true] },
    ],
  },
  {
    title: 'Email & Automation',
    rows: [
      { label: 'Email integration',    values: [false,          true,             true,            true] },
      { label: 'Email sequences',      values: [false,          '3',              'Unlimited',     'Unlimited'] },
      { label: 'Automation workflows', values: [false,          '5',              'Unlimited',     'Unlimited'] },
      { label: 'Webhooks & API',       values: [false,          false,            true,            true] },
    ],
  },
  {
    title: 'Analytics & Reporting',
    rows: [
      { label: 'Basic analytics',      values: [true,           true,             true,            true] },
      { label: 'Advanced analytics',   values: [false,          false,            true,            true] },
      { label: 'Custom reports',       values: [false,          false,            true,            true] },
      { label: 'Revenue forecasting',  values: [false,          false,            true,            true] },
    ],
  },
  {
    title: 'AI Features',
    rows: [
      { label: 'AI lead scoring',      values: [false,          false,            true,            true] },
      { label: 'AI email drafting',    values: [false,          false,            true,            true] },
      { label: 'AI copilot chat',      values: [false,          false,            true,            true] },
      { label: 'Custom AI training',   values: [false,          false,            false,           true] },
    ],
  },
  {
    title: 'Blockchain & Security',
    rows: [
      { label: 'Blockchain audit trail', values: [false,        false,            true,            true] },
      { label: 'SSO / SAML',           values: [false,          false,            false,           true] },
      { label: 'Custom data retention',values: [false,          false,            false,           true] },
    ],
  },
  {
    title: 'Support',
    rows: [
      { label: 'Community support',    values: [true,           true,             true,            true] },
      { label: 'Email support',        values: [false,          true,             true,            true] },
      { label: 'Priority phone support', values: [false,        false,            true,            true] },
      { label: 'Dedicated account manager', values: [false,     false,            false,           true] },
      { label: 'Custom SLA',           values: [false,          false,            false,           true] },
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function CellValue({ value }: { value: Cell }) {
  if (value === true)  return <Check size={16} className="text-blue-500 mx-auto" strokeWidth={2.5} />;
  if (value === false) return <Minus size={14} className="text-slate-300 mx-auto" />;
  return <span className="text-sm text-slate-700 text-center block">{value}</span>;
}

function BillingToggle({
  billing,
  onChange,
}: {
  billing: 'monthly' | 'annual';
  onChange: (v: 'monthly' | 'annual') => void;
}) {
  return (
    <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-1 gap-1">
      <button
        onClick={() => onChange('monthly')}
        className={cn(
          'px-4 py-2 rounded-md text-sm font-semibold transition-all',
          billing === 'monthly'
            ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
            : 'text-slate-500 hover:text-slate-700',
        )}
      >
        Pay Monthly
      </button>
      <button
        onClick={() => onChange('annual')}
        className={cn(
          'px-4 py-2 rounded-md text-sm font-semibold transition-all flex items-center gap-2',
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
  );
}

// ── PricingPage ───────────────────────────────────────────────────────────────

export default function PricingPage() {
  const router = useRouter();
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly');
  const annual = billing === 'annual';

  function handleCta(plan: (typeof PLANS)[number]) {
    if (plan.ctaHref) { router.push(plan.ctaHref); return; }
    router.push(`/checkout?plan=${plan.id}&billing=${billing}`);
  }

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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-8 text-center">
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 mb-3 leading-tight tracking-tight">
          CRM Platform pricing
        </h1>
        <p className="text-base sm:text-lg text-slate-500 max-w-xl mx-auto mb-7">
          All prices in <span className="font-semibold text-slate-700">USD</span>.
          Start free &mdash; upgrade whenever you&apos;re ready.
        </p>
        <BillingToggle billing={billing} onChange={setBilling} />
      </div>

      {/* ════════════════════════════════════════════════════════════════
          MOBILE LAYOUT  (hidden on lg+)
          Vertical card stack — one card per plan
      ════════════════════════════════════════════════════════════════ */}
      <div className="lg:hidden max-w-xl mx-auto px-4 pb-16 space-y-5">
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            className={cn(
              'rounded-2xl border p-6',
              plan.highlight
                ? 'border-blue-500 bg-blue-50 shadow-lg shadow-blue-100'
                : 'border-slate-200 bg-white',
            )}
          >
            {/* Badge */}
            {plan.badge && (
              <span
                className={cn(
                  'inline-block text-xs font-bold px-3 py-1 rounded-full mb-3',
                  plan.highlight
                    ? 'bg-blue-600 text-white'
                    : 'bg-amber-100 text-amber-700 border border-amber-200',
                )}
              >
                {plan.badge}
              </span>
            )}

            {/* Plan name + price */}
            <div className="flex items-start justify-between mb-1">
              <p className={cn('text-xs font-bold uppercase tracking-widest', plan.highlight ? 'text-blue-600' : 'text-slate-500')}>
                {plan.name}
              </p>
            </div>

            <div className="flex items-baseline gap-1 mb-1">
              {plan.monthlyPrice === 0 ? (
                <span className="text-3xl font-bold text-slate-900">Free</span>
              ) : (
                <>
                  {annual && (
                    <span className="text-sm text-slate-400 line-through mr-1">
                      ${plan.monthlyPrice}
                    </span>
                  )}
                  <span className="text-sm text-slate-400">$</span>
                  <span className="text-3xl font-bold text-slate-900">
                    {annual ? plan.annualPrice : plan.monthlyPrice}
                  </span>
                  <span className="text-sm text-slate-500">/mo</span>
                </>
              )}
            </div>

            {annual && plan.monthlyPrice > 0 && (
              <p className="text-xs text-emerald-600 font-medium mb-2">
                Billed annually &mdash; save ${(plan.monthlyPrice - plan.annualPrice) * 12}/yr
              </p>
            )}

            <p className="text-sm text-slate-500 mb-5">{plan.description}</p>

            {/* CTA */}
            <button
              onClick={() => handleCta(plan)}
              className={cn(
                'w-full text-sm font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 mb-6',
                plan.id === 'free'
                  ? 'border border-slate-300 text-slate-700 hover:bg-slate-50'
                  : plan.highlight
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-orange-500 hover:bg-orange-600 text-white',
              )}
            >
              {plan.ctaLabel}
              {plan.id !== 'free' && <ArrowRight size={15} strokeWidth={2.5} />}
            </button>

            {/* Features */}
            <ul className="space-y-2.5">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-slate-700">
                  <Check size={15} className="text-blue-500 flex-shrink-0 mt-0.5" strokeWidth={2.5} />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        ))}

        {/* Enterprise */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
          <p className="font-bold text-slate-900 text-lg mb-1">Enterprise</p>
          <p className="text-sm text-slate-500 mb-5">
            Custom pricing · Unlimited everything · SSO/SAML · Dedicated infrastructure · Custom contracts
          </p>
          <a
            href="mailto:sales@crmplatform.io"
            className="w-full text-sm font-semibold bg-slate-900 hover:bg-slate-700 text-white py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <Phone size={14} />
            Contact sales
          </a>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════
          DESKTOP LAYOUT  (hidden below lg)
          Sticky column headers + feature comparison table
      ════════════════════════════════════════════════════════════════ */}
      <div className="hidden lg:block">

        {/* Sticky plan column headers */}
        <div className="sticky top-16 z-40 bg-white border-b border-slate-200 shadow-sm">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="grid grid-cols-5">
              <div className="py-5 pr-6" />
              {PLANS.map((plan) => (
                <div
                  key={plan.id}
                  className={cn(
                    'py-5 px-4 border-l border-slate-100 text-center',
                    plan.highlight && 'bg-blue-50',
                  )}
                >
                  <p className={cn('text-xs font-bold uppercase tracking-widest mb-1', plan.highlight ? 'text-blue-600' : 'text-slate-500')}>
                    {plan.name}
                  </p>
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

        {/* Plan descriptions row */}
        <div className="max-w-7xl mx-auto px-6 lg:px-8 border-b border-slate-100">
          <div className="grid grid-cols-5">
            <div className="py-4 pr-6" />
            {PLANS.map((plan) => (
              <div
                key={plan.id}
                className={cn('py-4 px-4 border-l border-slate-100', plan.highlight && 'bg-blue-50/50')}
              >
                <p className="text-xs text-slate-500 leading-relaxed text-center">{plan.description}</p>
                {plan.badge && (
                  <p className="text-center mt-1.5">
                    <span className={cn(
                      'inline-block text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide',
                      plan.highlight ? 'text-blue-600 bg-blue-100' : 'text-amber-700 bg-amber-100',
                    )}>
                      {plan.badge}
                    </span>
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Feature comparison table */}
        <div className="max-w-7xl mx-auto px-6 lg:px-8 pb-24">
          {FEATURE_SECTIONS.map((section) => (
            <div key={section.title}>
              {/* Section heading */}
              <div className="grid grid-cols-5 border-b border-slate-200 bg-slate-50">
                <div className="py-3 pr-6">
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
                  <div className="py-3.5 pr-6 flex items-center">
                    <span className="text-sm text-slate-700">{row.label}</span>
                  </div>
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

          {/* Bottom CTA row */}
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
      </div>

      {/* ── Trust strip ── */}
      <div className="border-t border-slate-200 py-10 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm text-slate-500">
            {[
              '🔒 256-bit SSL encryption',
              '✓ PCI DSS compliant',
              '✓ Cancel anytime',
              '✓ No hidden fees',
              '⛓ Blockchain-verified payments',
            ].map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
          <p className="text-center text-xs text-slate-400 mt-6">
            Already have an account?{' '}
            <Link href="/login" className="text-blue-600 hover:underline">Sign in</Link>
            {' '}to manage your subscription from Settings &rarr; Billing.
          </p>
        </div>
      </div>

    </div>
  );
}
