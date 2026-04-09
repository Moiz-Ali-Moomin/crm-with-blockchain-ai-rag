/**
 * Dashboard — React Server Component
 *
 * Layout:
 *  TOP:    4 KPI cards (Total Leads, Open Deals, Revenue MTD, Conversion Rate)
 *  MIDDLE: 70% charts (Revenue + Pipeline Funnel) | 30% Tasks + Activity feed
 *  FLOAT:  AI Copilot floating widget (bottom-right)
 */

import { Suspense } from 'react';
import { getDashboardMetrics } from '@/lib/api/server/analytics.server';
import { StatCard } from '@/components/ui/stat-card';
import { DashboardCharts } from './_components/dashboard-charts';
import { FloatingAiCopilot } from './_components/ai-copilot-widget';
import { Users, TrendingUp, DollarSign, Percent, Clock, CheckSquare } from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Dashboard' };
export const revalidate = 30;

// ── Mock data ─────────────────────────────────────────────────────────────────

const MOCK_TASKS = [
  { id: '1', title: 'Follow up with Acme Corp',        priority: 'high',   due: 'Today, 2:00 PM', initials: 'JD' },
  { id: '2', title: 'Review proposal for TechStart',   priority: 'medium', due: 'Today, 4:30 PM', initials: 'SA' },
  { id: '3', title: 'Schedule demo with GlobalTech',   priority: 'low',    due: 'Today, 5:00 PM', initials: 'MK' },
  { id: '4', title: 'Update pipeline for Q2 deals',    priority: 'medium', due: 'Today, EOD',     initials: 'JD' },
] as const;

const MOCK_ACTIVITY = [
  { id: '1', user: 'James D.',  action: 'closed deal',    entity: 'Acme Corp — $12,400',          time: '8m ago',  dot: 'bg-emerald-400' },
  { id: '2', user: 'Sara A.',   action: 'added contact',  entity: 'John Smith @ TechStart',       time: '23m ago', dot: 'bg-blue-400' },
  { id: '3', user: 'Mike K.',   action: 'moved lead',     entity: 'GlobalTech → Qualified',       time: '1h ago',  dot: 'bg-violet-400' },
  { id: '4', user: 'James D.',  action: 'sent email to',  entity: 'Lisa Wang @ Vertex AI',        time: '2h ago',  dot: 'bg-blue-400' },
  { id: '5', user: 'Sara A.',   action: 'opened ticket',  entity: 'Onboarding issue #TK-204',     time: '3h ago',  dot: 'bg-amber-400' },
] as const;

const priorityStyles: Record<string, string> = {
  high:   'bg-rose-500/15 text-rose-400',
  medium: 'bg-amber-500/15 text-amber-400',
  low:    'bg-gray-500/15 text-gray-500',
};

// ── Skeletons ─────────────────────────────────────────────────────────────────

function ChartsSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {[0, 1].map((i) => (
        <div
          key={i}
          className="h-[300px] bg-gray-800/40 animate-pulse rounded-xl"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

// ── Section heading ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500 mb-3">
      {children}
    </p>
  );
}

// ── Tasks list ────────────────────────────────────────────────────────────────

function TasksList() {
  return (
    <div className="bg-[#1f2937] border border-gray-700/60 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400">
            <CheckSquare size={14} strokeWidth={2} />
          </div>
          <span className="text-sm font-semibold text-white">Tasks Due Today</span>
        </div>
        <span className="text-xs text-gray-500 font-medium bg-gray-700/60 px-2 py-0.5 rounded-full">
          {MOCK_TASKS.length}
        </span>
      </div>

      <div className="space-y-2">
        {MOCK_TASKS.map((task) => (
          <div
            key={task.id}
            className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-700/30 transition-colors duration-150 group cursor-pointer"
          >
            {/* Checkbox placeholder */}
            <div className="mt-0.5 w-4 h-4 rounded border border-gray-600 group-hover:border-blue-500 transition-colors shrink-0" />

            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-200 truncate group-hover:text-white transition-colors">
                {task.title}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <Clock size={11} className="text-gray-600" />
                <span className="text-[11px] text-gray-500">{task.due}</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <span className={cn(
                'text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded',
                priorityStyles[task.priority],
              )}>
                {task.priority}
              </span>
              <span className="w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center text-[9px] font-bold text-gray-400">
                {task.initials}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Activity feed ─────────────────────────────────────────────────────────────

function ActivityFeed() {
  return (
    <div className="bg-[#1f2937] border border-gray-700/60 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-semibold text-white">Recent Activity</span>
        <button className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
          View all
        </button>
      </div>

      <div className="space-y-0">
        {MOCK_ACTIVITY.map((item, i) => (
          <div key={item.id} className="flex gap-3">
            {/* Timeline */}
            <div className="flex flex-col items-center">
              <span className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0', item.dot)} />
              {i < MOCK_ACTIVITY.length - 1 && (
                <div className="w-px flex-1 bg-gray-700/60 my-1" />
              )}
            </div>

            {/* Content */}
            <div className="pb-3 min-w-0 flex-1">
              <p className="text-sm text-gray-300 leading-snug">
                <span className="font-medium text-white">{item.user}</span>
                {' '}{item.action}{' '}
                <span className="text-gray-400">{item.entity}</span>
              </p>
              <p className="text-[11px] text-gray-600 mt-0.5">{item.time}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const metrics = await getDashboardMetrics();

  const kpiCards = metrics
    ? [
        {
          title:        'Total Leads',
          value:        metrics.totalLeads,
          displayValue: metrics.totalLeads.toLocaleString(),
          icon:         <Users size={15} strokeWidth={2} />,
          gradient:     1 as const,
          trend: {
            direction: 'up' as const,
            value:     `+${metrics.newLeadsThisMonth}`,
            label:     'this month',
          },
        },
        {
          title:        'Open Deals',
          value:        metrics.openDeals,
          displayValue: metrics.openDeals.toLocaleString(),
          icon:         <TrendingUp size={15} strokeWidth={2} />,
          gradient:     3 as const,
          sub:          `${formatCurrency(metrics.totalDealValue)} pipeline`,
        },
        {
          title:        'Revenue (MTD)',
          value:        formatCurrency(metrics.revenueThisMonth),
          displayValue: formatCurrency(metrics.revenueThisMonth),
          icon:         <DollarSign size={15} strokeWidth={2} />,
          gradient:     2 as const,
          trend: {
            direction: (metrics.revenueGrowth >= 0 ? 'up' : 'down') as 'up' | 'down',
            value:     `${metrics.revenueGrowth >= 0 ? '+' : ''}${metrics.revenueGrowth.toFixed(1)}%`,
            label:     'vs last month',
          },
        },
        {
          title:        'Conversion Rate',
          value:        `${metrics.conversionRate.toFixed(1)}%`,
          displayValue: `${metrics.conversionRate.toFixed(1)}%`,
          icon:         <Percent size={15} strokeWidth={2} />,
          gradient:     4 as const,
          sub:          'Lead → Deal',
        },
      ]
    : [
        { title: 'Total Leads',     icon: <Users size={15} strokeWidth={2} />,     gradient: 1 as const, value: '1,204', displayValue: '1,204',  trend: { direction: 'up' as const, value: '+48', label: 'this month' } },
        { title: 'Open Deals',      icon: <TrendingUp size={15} strokeWidth={2} />, gradient: 3 as const, value: '86',    displayValue: '86',     sub: '$248,000 pipeline' },
        { title: 'Revenue (MTD)',    icon: <DollarSign size={15} strokeWidth={2} />, gradient: 2 as const, value: '$32,450', displayValue: '$32,450', trend: { direction: 'up' as const, value: '+8.2%', label: 'vs last month' } },
        { title: 'Conversion Rate', icon: <Percent size={15} strokeWidth={2} />,   gradient: 4 as const, value: '12.4%', displayValue: '12.4%',  sub: 'Lead → Deal' },
      ];

  return (
    <div className="space-y-6">
      {/* ── KPI row ────────────────────────────────────────────────────────── */}
      <section>
        <SectionLabel>Key Metrics</SectionLabel>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpiCards.map((card, i) => (
            <StatCard
              key={card.title}
              index={i}
              title={card.title}
              value={card.value}
              displayValue={card.displayValue}
              icon={card.icon}
              gradient={card.gradient}
              trend={'trend' in card ? card.trend : undefined}
              sub={'sub' in card ? card.sub : undefined}
            />
          ))}
        </div>
      </section>

      {/* ── Charts + sidebar ───────────────────────────────────────────────── */}
      <section>
        <div className="grid grid-cols-1 xl:grid-cols-10 gap-4">
          {/* Left: charts (70%) */}
          <div className="xl:col-span-7">
            <SectionLabel>Performance</SectionLabel>
            <Suspense fallback={<ChartsSkeleton />}>
              <DashboardCharts />
            </Suspense>
          </div>

          {/* Right: tasks + activity (30%) */}
          <div className="xl:col-span-3 space-y-4">
            <SectionLabel>Today</SectionLabel>
            <TasksList />
            <ActivityFeed />
          </div>
        </div>
      </section>

      {/* ── Floating AI Copilot ────────────────────────────────────────────── */}
      <FloatingAiCopilot />
    </div>
  );
}
