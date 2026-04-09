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
import {
  Users, TrendingUp, DollarSign, Percent,
  Clock, CheckSquare, ArrowUpRight,
} from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Dashboard' };
export const revalidate = 30;

// ── Mock data ─────────────────────────────────────────────────────────────────

const MOCK_TASKS = [
  { id: '1', title: 'Follow up with Acme Corp',       priority: 'high',   due: 'Today, 2:00 PM', initials: 'JD' },
  { id: '2', title: 'Review proposal for TechStart',  priority: 'medium', due: 'Today, 4:30 PM', initials: 'SA' },
  { id: '3', title: 'Schedule demo with GlobalTech',  priority: 'low',    due: 'Today, 5:00 PM', initials: 'MK' },
  { id: '4', title: 'Update pipeline for Q2 deals',   priority: 'medium', due: 'Today, EOD',     initials: 'JD' },
] as const;

const MOCK_ACTIVITY = [
  { id: '1', user: 'James D.', initials: 'JD', action: 'closed deal',   entity: 'Acme Corp — $12,400',      time: '8m ago',  color: 'bg-emerald-500', bgColor: 'bg-emerald-50', textColor: 'text-emerald-700' },
  { id: '2', user: 'Sara A.',  initials: 'SA', action: 'added contact', entity: 'John Smith @ TechStart',   time: '23m ago', color: 'bg-blue-500',    bgColor: 'bg-blue-50',    textColor: 'text-blue-700' },
  { id: '3', user: 'Mike K.',  initials: 'MK', action: 'moved lead',    entity: 'GlobalTech → Qualified',   time: '1h ago',  color: 'bg-violet-500',  bgColor: 'bg-violet-50',  textColor: 'text-violet-700' },
  { id: '4', user: 'James D.', initials: 'JD', action: 'sent email to', entity: 'Lisa Wang @ Vertex AI',    time: '2h ago',  color: 'bg-blue-500',    bgColor: 'bg-blue-50',    textColor: 'text-blue-700' },
  { id: '5', user: 'Sara A.',  initials: 'SA', action: 'opened ticket', entity: 'Onboarding issue #TK-204', time: '3h ago',  color: 'bg-amber-500',   bgColor: 'bg-amber-50',   textColor: 'text-amber-700' },
] as const;

const priorityStyles: Record<string, string> = {
  high:   'bg-rose-50 text-rose-600 border border-rose-100',
  medium: 'bg-amber-50 text-amber-600 border border-amber-100',
  low:    'bg-gray-100 text-gray-500 border border-gray-200',
};

// ── Skeletons ─────────────────────────────────────────────────────────────────

function ChartsSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {[0, 1].map((i) => (
        <div
          key={i}
          className="h-[300px] bg-white border border-gray-200 animate-pulse rounded-xl"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

// ── Section heading ───────────────────────────────────────────────────────────

function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: { label: string; href?: string };
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-400">
        {title}
      </h2>
      {action && (
        <a
          href={action.href ?? '#'}
          className="text-[11px] font-medium text-blue-600 hover:text-blue-700 transition-colors flex items-center gap-0.5"
        >
          {action.label}
          <ArrowUpRight size={11} strokeWidth={2} />
        </a>
      )}
    </div>
  );
}

// ── Tasks list ────────────────────────────────────────────────────────────────

function TasksList() {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Card header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-blue-50">
            <CheckSquare size={13} strokeWidth={2} className="text-blue-600" />
          </div>
          <span className="text-[13px] font-semibold text-gray-900">Tasks Due Today</span>
        </div>
        <span className="text-[11px] text-gray-500 font-semibold bg-gray-100 px-2 py-0.5 rounded-full tabular-nums">
          {MOCK_TASKS.length}
        </span>
      </div>

      {/* Task rows */}
      <div className="divide-y divide-gray-100">
        {MOCK_TASKS.map((task) => (
          <div
            key={task.id}
            className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors duration-150 group cursor-pointer"
          >
            {/* Checkbox */}
            <div className="w-4 h-4 rounded border border-gray-300 group-hover:border-blue-400 transition-colors shrink-0" />

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-gray-700 font-medium truncate group-hover:text-gray-900 transition-colors">
                {task.title}
              </p>
              <div className="flex items-center gap-1 mt-0.5">
                <Clock size={10} className="text-gray-400" />
                <span className="text-[11px] text-gray-400">{task.due}</span>
              </div>
            </div>

            {/* Meta */}
            <div className="flex items-center gap-2 shrink-0">
              <span className={cn(
                'text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full',
                priorityStyles[task.priority],
              )}>
                {task.priority}
              </span>
              <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center text-[9px] font-bold text-gray-600">
                {task.initials}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
        <a
          href="/tasks"
          className="text-[12px] font-medium text-blue-600 hover:text-blue-700 transition-colors flex items-center gap-1"
        >
          View all tasks
          <ArrowUpRight size={11} strokeWidth={2} />
        </a>
      </div>
    </div>
  );
}

// ── Activity feed ─────────────────────────────────────────────────────────────

function ActivityFeed() {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Card header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <span className="text-[13px] font-semibold text-gray-900">Recent Activity</span>
        <a
          href="/activities"
          className="text-[11px] font-medium text-blue-600 hover:text-blue-700 transition-colors flex items-center gap-0.5"
        >
          View all
          <ArrowUpRight size={11} strokeWidth={2} />
        </a>
      </div>

      {/* Feed items */}
      <div className="divide-y divide-gray-50">
        {MOCK_ACTIVITY.map((item) => (
          <div
            key={item.id}
            className="flex items-start gap-3 px-5 py-3 hover:bg-gray-50 transition-colors duration-150 group"
          >
            {/* User avatar */}
            <div className={cn(
              'w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold text-white',
              item.color,
            )}>
              {item.initials}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className="text-[12px] text-gray-600 leading-snug">
                <span className="font-semibold text-gray-900">{item.user}</span>
                {' '}{item.action}{' '}
                <span className="text-gray-500">{item.entity}</span>
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">{item.time}</p>
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
          icon:         <Users size={14} strokeWidth={2} />,
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
          icon:         <TrendingUp size={14} strokeWidth={2} />,
          gradient:     3 as const,
          sub:          `${formatCurrency(metrics.totalDealValue)} pipeline`,
        },
        {
          title:        'Revenue (MTD)',
          value:        formatCurrency(metrics.revenueThisMonth),
          displayValue: formatCurrency(metrics.revenueThisMonth),
          icon:         <DollarSign size={14} strokeWidth={2} />,
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
          icon:         <Percent size={14} strokeWidth={2} />,
          gradient:     4 as const,
          sub:          'Lead → Deal',
        },
      ]
    : [
        { title: 'Total Leads',     icon: <Users size={14} strokeWidth={2} />,      gradient: 1 as const, value: '1,204',   displayValue: '1,204',   trend: { direction: 'up' as const, value: '+48', label: 'this month' } },
        { title: 'Open Deals',      icon: <TrendingUp size={14} strokeWidth={2} />, gradient: 3 as const, value: '86',      displayValue: '86',      sub: '$248,000 pipeline' },
        { title: 'Revenue (MTD)',    icon: <DollarSign size={14} strokeWidth={2} />, gradient: 2 as const, value: '$32,450', displayValue: '$32,450', trend: { direction: 'up' as const, value: '+8.2%', label: 'vs last month' } },
        { title: 'Conversion Rate', icon: <Percent size={14} strokeWidth={2} />,    gradient: 4 as const, value: '12.4%',  displayValue: '12.4%',   sub: 'Lead → Deal' },
      ];

  return (
    <div className="space-y-6">
      {/* ── KPI row ────────────────────────────────────────────────────────── */}
      <section>
        <SectionHeader title="Key Metrics" />
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
            <SectionHeader title="Performance" action={{ label: 'Full report', href: '/analytics' }} />
            <Suspense fallback={<ChartsSkeleton />}>
              <DashboardCharts />
            </Suspense>
          </div>

          {/* Right: tasks + activity (30%) */}
          <div className="xl:col-span-3 space-y-4">
            <SectionHeader title="Today" action={{ label: 'All tasks', href: '/tasks' }} />
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
