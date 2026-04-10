'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Zap, Brain, GitBranch, Mail, BarChart2, ShieldCheck, Users,
  ArrowRight, Check, Star, TrendingUp, LayoutDashboard,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ── Static data ───────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: Brain,
    title: 'AI Lead Scoring',
    description: 'Automatically rank leads by close probability using ML signals from email, calls, and deal history.',
  },
  {
    icon: GitBranch,
    title: 'Visual Pipeline',
    description: 'Drag-and-drop deal stages with real-time team visibility. Never lose track of where a deal stands.',
  },
  {
    icon: Mail,
    title: 'Email Sequences',
    description: 'Automated follow-up workflows that trigger on lead behavior. Set it once, close deals on autopilot.',
  },
  {
    icon: BarChart2,
    title: 'Revenue Analytics',
    description: 'Real-time forecasting with monthly and quarterly breakdowns. Know your number before month-end.',
  },
  {
    icon: ShieldCheck,
    title: 'Blockchain Audit',
    description: 'Immutable activity log — every deal action cryptographically recorded. Full compliance, zero effort.',
  },
  {
    icon: Users,
    title: 'Team Collaboration',
    description: 'Shared inbox, activity feeds, and @mention notifications. Keep your whole team aligned on every deal.',
  },
] as const;

const STATS = [
  { value: '2,400+', label: 'Teams using the platform' },
  { value: '38%',    label: 'Average increase in close rate' },
  { value: '$2.1B',  label: 'In pipeline managed' },
  { value: '4.9/5',  label: 'Average customer rating' },
] as const;

const LOGOS = ['Acme Corp', 'Vertex AI', 'TechStart', 'GlobalTech', 'NovaSales', 'PeakCRM'] as const;

const CHAT = [
  { role: 'user',      text: 'Which leads are most likely to close this quarter?' },
  { role: 'assistant', text: 'Based on engagement signals, 3 leads have a >80% close probability: Acme Corp ($24k), TechStart ($18k), and Vertex AI ($12k). I recommend reaching out to Acme first — their last email opened 4×.' },
  { role: 'user',      text: 'Draft a follow-up email for Acme Corp.' },
] as const;

const SIDEBAR_NAV = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Leads',     icon: Users },
  { label: 'Deals',     icon: TrendingUp },
  { label: 'Pipeline',  icon: GitBranch },
  { label: 'Analytics', icon: BarChart2 },
] as const;

// ── LandingNav ────────────────────────────────────────────────────────────────

function LandingNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  return (
    <header
      className={cn(
        'fixed top-0 inset-x-0 z-50 bg-white transition-all duration-200',
        scrolled ? 'shadow-sm border-b border-slate-200' : 'border-b border-transparent',
      )}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <Zap size={16} className="text-white" strokeWidth={2.5} />
          </div>
          <span className="text-slate-900 font-bold text-[17px] tracking-tight">CRM Platform</span>
        </Link>

        {/* Nav links */}
        <nav className="hidden md:flex items-center gap-8">
          {[
            { label: 'Features', href: '#features' },
            { label: 'AI',       href: '#ai' },
            { label: 'Pricing',  href: '/pricing' },
          ].map(({ label, href }) => (
            <Link
              key={label}
              href={href}
              className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors duration-150"
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/login">Sign in</Link>
          </Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" asChild>
            <Link href="/login">Start free trial</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

// ── HeroSection ───────────────────────────────────────────────────────────────

function HeroSection() {
  return (
    <section className="pt-32 pb-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:gap-16 xl:gap-24">

          {/* Left: copy */}
          <div className="lg:w-[480px] shrink-0">
            {/* Badge */}
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full mb-7">
              <Star size={12} strokeWidth={2.5} fill="currentColor" />
              Trusted by 2,400+ sales teams worldwide
            </div>

            {/* Headline */}
            <h1 className="text-5xl lg:text-[3.5rem] xl:text-6xl font-bold text-slate-900 tracking-tight leading-[1.08] mb-6">
              Close more deals with AI&#8209;powered CRM
            </h1>

            {/* Subheadline */}
            <p className="text-lg text-slate-600 leading-relaxed max-w-md mb-8">
              Manage your entire sales pipeline in one place. AI lead scoring, visual pipeline,
              and real&#8209;time analytics — built for teams that want to hit quota.
            </p>

            {/* CTA buttons */}
            <div className="flex flex-col sm:flex-row items-start gap-3 mb-6">
              <Button
                size="lg"
                className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
                asChild
              >
                <Link href="/login">
                  Start free trial
                  <ArrowRight size={16} />
                </Link>
              </Button>
              <Button size="lg" variant="outline" className="border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-slate-50" asChild>
                <Link href="/login">See a demo</Link>
              </Button>
            </div>

            {/* Trust line */}
            <p className="text-xs text-slate-400">
              No credit card required · Free 14&#8209;day trial · Cancel anytime
            </p>
          </div>

          {/* Right: mock dashboard */}
          <div className="flex-1 mt-14 lg:mt-0 min-w-0">
            <div className="rounded-2xl border border-slate-200 shadow-2xl overflow-hidden bg-white ring-1 ring-slate-900/5">

              {/* Browser chrome */}
              <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-200">
                <div className="flex gap-1.5 shrink-0">
                  <span className="w-3 h-3 rounded-full bg-red-400" />
                  <span className="w-3 h-3 rounded-full bg-amber-400" />
                  <span className="w-3 h-3 rounded-full bg-emerald-400" />
                </div>
                <div className="flex-1 mx-3 bg-white border border-slate-200 rounded px-3 py-1 text-[11px] text-slate-400 truncate">
                  app.crmplatform.io/dashboard
                </div>
              </div>

              {/* App shell */}
              <div className="flex h-[380px]">

                {/* Mini sidebar */}
                <div className="w-[140px] shrink-0 bg-slate-900 flex flex-col py-4 px-3 gap-0.5">
                  <div className="flex items-center gap-2 px-2 mb-5">
                    <div className="w-6 h-6 rounded-md bg-blue-600 flex items-center justify-center shrink-0">
                      <Zap size={11} className="text-white" strokeWidth={2.5} />
                    </div>
                    <span className="text-white text-xs font-bold tracking-tight">CRM</span>
                  </div>
                  {SIDEBAR_NAV.map(({ label, icon: Icon }, i) => (
                    <div
                      key={label}
                      className={cn(
                        'flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium',
                        i === 0
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-500 hover:text-slate-300',
                      )}
                    >
                      <Icon size={13} strokeWidth={1.8} />
                      <span>{label}</span>
                    </div>
                  ))}
                </div>

                {/* Main content */}
                <div className="flex-1 bg-slate-50 p-4 overflow-hidden min-w-0">
                  {/* KPI row */}
                  <div className="grid grid-cols-4 gap-2 mb-4">
                    {[
                      { label: 'Leads',   value: '1,204', color: 'text-blue-600' },
                      { label: 'Deals',   value: '86',    color: 'text-emerald-600' },
                      { label: 'Revenue', value: '$32k',  color: 'text-violet-600' },
                      { label: 'Conv.',   value: '12.4%', color: 'text-amber-600' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="bg-white rounded-lg p-2.5 border border-slate-200 min-w-0">
                        <p className="text-[9px] text-slate-400 mb-0.5 truncate">{label}</p>
                        <p className={cn('text-sm font-bold leading-none', color)}>{value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Charts row */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Area chart mock */}
                    <div className="bg-white rounded-xl border border-slate-200 p-3">
                      <p className="text-[10px] font-semibold text-slate-600 mb-3">Revenue trend</p>
                      <div className="flex items-end gap-0.5 h-[76px]">
                        {[40, 55, 35, 70, 60, 80, 65, 90, 75, 95, 85, 100].map((h, i) => (
                          <div
                            key={i}
                            className="flex-1 bg-blue-500/15 rounded-t-[2px] relative overflow-hidden"
                            style={{ height: `${h}%` }}
                          >
                            <div className="absolute top-0 inset-x-0 h-[2px] bg-blue-500 rounded-full" />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Pipeline funnel */}
                    <div className="bg-white rounded-xl border border-slate-200 p-3">
                      <p className="text-[10px] font-semibold text-slate-600 mb-2.5">Pipeline</p>
                      <div className="space-y-2">
                        {[
                          { stage: 'Prospect', pct: 100, bar: 'bg-blue-500' },
                          { stage: 'Qualify',  pct: 72,  bar: 'bg-indigo-500' },
                          { stage: 'Propose',  pct: 48,  bar: 'bg-violet-500' },
                          { stage: 'Close',    pct: 28,  bar: 'bg-emerald-500' },
                        ].map(({ stage, pct, bar }) => (
                          <div key={stage}>
                            <div className="flex justify-between text-[9px] text-slate-400 mb-1">
                              <span>{stage}</span>
                              <span>{pct}%</span>
                            </div>
                            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={cn('h-full rounded-full', bar)}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}

// ── LogoBar ───────────────────────────────────────────────────────────────────

function LogoBar() {
  return (
    <section className="py-12 bg-slate-50 border-y border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-center text-[11px] font-semibold text-slate-400 uppercase tracking-[0.14em] mb-8">
          Trusted by fast-growing sales teams
        </p>
        <div className="flex flex-wrap justify-center items-center gap-x-10 gap-y-4">
          {LOGOS.map((name) => (
            <span key={name} className="text-slate-400 font-semibold text-sm tracking-wide">
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── FeaturesSection ───────────────────────────────────────────────────────────

function FeaturesSection() {
  return (
    <section id="features" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="max-w-2xl mx-auto text-center mb-16">
          <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-4">
            Everything your sales team needs
          </h2>
          <p className="text-lg text-slate-600 leading-relaxed">
            From first touch to closed-won — manage your entire revenue motion
            without switching tabs.
          </p>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className={cn(
                'group p-6 rounded-xl border border-slate-200 bg-white cursor-default',
                'hover:border-blue-200 hover:shadow-md hover:-translate-y-0.5',
                'transition-all duration-200',
              )}
            >
              <div
                className={cn(
                  'w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center mb-5',
                  'group-hover:bg-blue-600 transition-colors duration-200',
                )}
              >
                <Icon
                  size={20}
                  strokeWidth={1.8}
                  className="text-blue-600 group-hover:text-white transition-colors duration-200"
                />
              </div>
              <h3 className="font-semibold text-slate-900 mb-2">{title}</h3>
              <p className="text-sm text-slate-600 leading-relaxed">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── AiSection ─────────────────────────────────────────────────────────────────

function AiSection() {
  return (
    <section id="ai" className="py-24 bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:gap-20 xl:gap-28">

          {/* Left: copy */}
          <div className="lg:w-[420px] shrink-0 mb-14 lg:mb-0">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full mb-6">
              <Brain size={12} strokeWidth={2.5} />
              AI&#8209;Powered
            </div>

            <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-5 leading-tight">
              Your AI sales assistant, always on
            </h2>

            <p className="text-lg text-slate-600 leading-relaxed mb-8">
              Ask questions about your pipeline, get intelligent follow-up suggestions,
              and draft emails in seconds — all powered by your real CRM data.
            </p>

            <ul className="space-y-3.5">
              {[
                'Ask questions in plain English about any deal or contact',
                'AI-generated follow-up suggestions based on engagement signals',
                'Draft personalized emails from deal history in one click',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-slate-700">
                  <span className="mt-0.5 w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                    <Check size={11} strokeWidth={3} className="text-white" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Right: chat mock */}
          <div className="flex-1 max-w-lg w-full">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

              {/* Chat header */}
              <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-200 bg-slate-50">
                <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                  <Brain size={15} className="text-white" strokeWidth={2} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900 leading-none mb-0.5">AI Copilot</p>
                  <p className="text-xs text-slate-500 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                    Online · Powered by GPT-4o
                  </p>
                </div>
              </div>

              {/* Messages */}
              <div className="p-4 space-y-3">
                {CHAT.map((msg, i) => (
                  <div
                    key={i}
                    className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}
                  >
                    <div
                      className={cn(
                        'max-w-[82%] px-4 py-2.5 text-sm leading-relaxed',
                        msg.role === 'user'
                          ? 'bg-blue-600 text-white rounded-2xl rounded-br-sm'
                          : 'bg-slate-100 text-slate-800 rounded-2xl rounded-bl-sm',
                      )}
                    >
                      {msg.text}
                    </div>
                  </div>
                ))}

                {/* Typing indicator */}
                <div className="flex justify-start">
                  <div className="bg-slate-100 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>

              {/* Input */}
              <div className="px-4 pb-4">
                <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3.5 py-2.5 bg-slate-50">
                  <span className="flex-1 text-xs text-slate-400">Ask about your pipeline…</span>
                  <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
                    <ArrowRight size={13} className="text-white" strokeWidth={2.5} />
                  </div>
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>
    </section>
  );
}

// ── StatsSection ──────────────────────────────────────────────────────────────

function StatsSection() {
  return (
    <section className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        <div className="max-w-2xl mx-auto text-center mb-16">
          <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-4">
            Numbers that move the needle
          </h2>
          <p className="text-lg text-slate-600 leading-relaxed">
            Join the teams already hitting quota with CRM Platform.
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
          {STATS.map(({ value, label }) => (
            <div key={label} className="text-center">
              <p className="text-4xl lg:text-5xl font-bold text-blue-600 mb-2 tabular-nums">
                {value}
              </p>
              <p className="text-sm text-slate-600 leading-relaxed">{label}</p>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}

// ── CtaSection ────────────────────────────────────────────────────────────────

function CtaSection() {
  return (
    <section id="pricing" className="py-28 bg-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">

        <h2 className="text-4xl lg:text-5xl font-bold text-white mb-5 leading-tight max-w-3xl mx-auto">
          Ready to close more deals?
        </h2>

        <p className="text-lg text-slate-400 max-w-xl mx-auto mb-10 leading-relaxed">
          Join 2,400 sales teams already using CRM Platform to manage their pipeline,
          score leads, and hit quota every quarter.
        </p>

        <div className="flex flex-col sm:flex-row justify-center gap-4">
          <Button
            size="lg"
            className="bg-blue-600 hover:bg-blue-500 text-white gap-2 transition-colors"
            asChild
          >
            <Link href="/pricing">
              View pricing & plans
              <ArrowRight size={16} />
            </Link>
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800 hover:border-slate-600 hover:text-white transition-colors"
            asChild
          >
            <Link href="/register">Start free trial</Link>
          </Button>
        </div>

        <p className="mt-8 text-xs text-slate-600">
          Free 14-day trial · No credit card · Cancel anytime
        </p>

      </div>
    </section>
  );
}

// ── LandingFooter ─────────────────────────────────────────────────────────────

function LandingFooter() {
  return (
    <footer className="py-10 bg-slate-900 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-5">

          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
              <Zap size={14} className="text-white" strokeWidth={2.5} />
            </div>
            <span className="text-white font-semibold text-sm">CRM Platform</span>
          </div>

          {/* Links */}
          <div className="flex items-center gap-6">
            {['Privacy', 'Terms', 'Status', 'Docs'].map((link) => (
              <a
                key={link}
                href="#"
                className="text-sm text-slate-500 hover:text-slate-300 transition-colors duration-150"
              >
                {link}
              </a>
            ))}
          </div>

          {/* Copyright */}
          <p className="text-sm text-slate-600">
            © {new Date().getFullYear()} CRM Platform. All rights reserved.
          </p>

        </div>
      </div>
    </footer>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HomePage() {
  return (
    <div className="relative bg-white text-slate-900 overflow-x-hidden">
      <LandingNav />
      <main>
        <HeroSection />
        <LogoBar />
        <FeaturesSection />
        <AiSection />
        <StatsSection />
        <CtaSection />
      </main>
      <LandingFooter />
    </div>
  );
}
