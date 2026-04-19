import { Suspense } from 'react';
import Link from "next/link";
import { getDashboardMetrics } from '@/lib/api/server/analytics.server';
import { StatCard } from '@/components/ui/stat-card';
import { DashboardCharts } from './_components/dashboard-charts';
import { FloatingAiCopilot } from './_components/ai-copilot-widget';
import { UpgradeBanner } from './_components/upgrade-banner';
import {
  Users, TrendingUp, DollarSign, Percent,
  Clock, CheckSquare, ArrowUpRight,
} from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Dashboard' };
export const revalidate = 30;

// ── Mock Data ─────────────────────────────────────────────────────────────────

const MOCK_TASKS = [
  { id: '1', title: 'Follow up with Acme Corp', priority: 'high', due: 'Today, 2:00 PM', initials: 'JD' },
  { id: '2', title: 'Review proposal for TechStart', priority: 'medium', due: 'Today, 4:30 PM', initials: 'SA' },
  { id: '3', title: 'Schedule demo with GlobalTech', priority: 'low', due: 'Today, 5:00 PM', initials: 'MK' },
  { id: '4', title: 'Update pipeline for Q2 deals', priority: 'medium', due: 'Today, EOD', initials: 'JD' },
] as const;

const MOCK_ACTIVITY = [
  { id: '1', user: 'James D.', initials: 'JD', action: 'closed deal', entity: 'Acme Corp — $12,400', time: '8m ago', color: 'bg-emerald-500' },
  { id: '2', user: 'Sara A.', initials: 'SA', action: 'added contact', entity: 'John Smith @ TechStart', time: '23m ago', color: 'bg-blue-500' },
  { id: '3', user: 'Mike K.', initials: 'MK', action: 'moved lead', entity: 'GlobalTech → Qualified', time: '1h ago', color: 'bg-violet-500' },
  { id: '4', user: 'James D.', initials: 'JD', action: 'sent email to', entity: 'Lisa Wang @ Vertex AI', time: '2h ago', color: 'bg-blue-500' },
  { id: '5', user: 'Sara A.', initials: 'SA', action: 'opened ticket', entity: 'Onboarding issue #TK-204', time: '3h ago', color: 'bg-amber-500' },
] as const;

const priorityStyles: Record<string, string> = {
  high:   'bg-rose-50 text-rose-600 border border-rose-100 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800',
  medium: 'bg-amber-50 text-amber-600 border border-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800',
  low:    'bg-shimmer-subtle text-fg-muted border border-ui-border',
};

// ── Skeleton ──────────────────────────────────────────────────────────────────

function ChartsSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {[0, 1].map((i) => (
        <div key={i} className="h-[300px] bg-canvas border border-ui-border animate-pulse rounded-xl" />
      ))}
    </div>
  );
}

// ── Section Header ────────────────────────────────────────────────────────────

function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: { label: string; href?: string };
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
        {title}
      </h2>
      {action && (
        <Link
          href={action.href || '/'}
          className="text-[11px] font-medium text-blue-600 hover:text-blue-700 flex items-center gap-0.5"
        >
          {action.label}
          <ArrowUpRight size={11} />
        </Link>
      )}
    </div>
  );
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

function TasksList() {
  return (
    <div className="bg-canvas border border-ui-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-ui-border-subtle">
        <div className="flex items-center gap-2">
          <CheckSquare size={13} className="text-blue-600" />
          <span className="text-[13px] font-semibold text-fg">Tasks Due Today</span>
        </div>
        <span className="text-[11px] bg-shimmer-subtle text-fg-muted px-2 py-0.5 rounded-full">
          {MOCK_TASKS.length}
        </span>
      </div>

      <div className="divide-y divide-ui-border-subtle">
        {MOCK_TASKS.map((task) => (
          <div key={task.id} className="flex items-center gap-3 px-5 py-3 hover:bg-canvas-subtle transition-colors">
            <div className="w-4 h-4 rounded border border-ui-border" />
            <div className="flex-1">
              <p className="text-[13px] font-medium text-fg">{task.title}</p>
              <div className="flex items-center gap-1 text-xs text-fg-subtle">
                <Clock size={10} /> {task.due}
              </div>
            </div>
            <span className={cn("text-[10px] px-2 py-0.5 rounded", priorityStyles[task.priority])}>
              {task.priority}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Activity ──────────────────────────────────────────────────────────────────

function ActivityFeed() {
  return (
    <div className="bg-canvas border border-ui-border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-ui-border-subtle flex justify-between">
        <span className="text-[13px] font-semibold text-fg">Recent Activity</span>
        <Link href="/activities" className="text-xs text-blue-600">View all</Link>
      </div>

      <div className="divide-y divide-ui-border-subtle">
        {MOCK_ACTIVITY.map((item) => (
          <div key={item.id} className="flex gap-3 px-5 py-3">
            <div className={`w-6 h-6 rounded-full text-white text-[9px] font-bold flex items-center justify-center shrink-0 ${item.color}`}>
              {item.initials}
            </div>
            <div>
              <p className="text-xs text-fg-secondary">
                <b className="text-fg font-semibold">{item.user}</b> {item.action} {item.entity}
              </p>
              <p className="text-[10px] text-fg-subtle">{item.time}</p>
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

  // ✅ SAFE FIELD ACCESS (no TS errors ever)
  const revenue =
    (metrics as any)?.revenue ??
    (metrics as any)?.revenueMTD ??
    0;

  const kpiCards = [
    {
      title: 'Total Leads',
      value: metrics?.totalLeads ?? 0,
      displayValue: (metrics?.totalLeads ?? 0).toLocaleString(),
      icon: <Users size={14} />,
      gradient: 1 as const,
    },
    {
      title: 'Open Deals',
      value: metrics?.openDeals ?? 0,
      displayValue: (metrics?.openDeals ?? 0).toString(),
      icon: <TrendingUp size={14} />,
      gradient: 2 as const,
    },
    {
      title: 'Revenue (MTD)',
      value: revenue,
      displayValue: formatCurrency(revenue),
      icon: <DollarSign size={14} />,
      gradient: 3 as const,
    },
    {
      title: 'Conversion Rate',
      value: metrics?.conversionRate ?? 0,
      displayValue: `${metrics?.conversionRate ?? 0}%`,
      icon: <Percent size={14} />,
      gradient: 4 as const,
    },
  ];

  return (
    <div className="space-y-6">

      {/* UPGRADE BANNER — only visible for free plan users */}
      <UpgradeBanner />

      {/* KEY METRICS */}
      <section>
        <SectionHeader title="Key Metrics" />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {kpiCards.map((card, i) => (
            <StatCard key={i} {...card} />
          ))}
        </div>
      </section>

      {/* PERFORMANCE */}
      <section>
        <div className="grid grid-cols-1 xl:grid-cols-10 gap-4">

          <div className="xl:col-span-7">
            <SectionHeader title="Performance" action={{ label: 'Full report', href: '/analytics' }} />
            <Suspense fallback={<ChartsSkeleton />}>
              <DashboardCharts />
            </Suspense>
          </div>

          <div className="xl:col-span-3 space-y-4">
            <SectionHeader title="Today" action={{ label: 'All tasks', href: '/tasks' }} />
            <TasksList />
            <ActivityFeed />
          </div>

        </div>
      </section>

      <FloatingAiCopilot />
    </div>
  );
}