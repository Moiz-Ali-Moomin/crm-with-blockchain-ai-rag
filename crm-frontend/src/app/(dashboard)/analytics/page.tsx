'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { analyticsApi } from '@/lib/api/analytics.api';
import { queryKeys } from '@/lib/query/query-keys';
import { formatCurrency, cn } from '@/lib/utils';
import { useThemeStore } from '@/store/theme.store';
import {
  TrendingUp, PieChart as PieIcon, BarChart2, Users,
  DollarSign, Percent, Award, Loader2,
} from 'lucide-react';
import type { SalesRepPerformance } from '@/types';

// ─── Colors ───────────────────────────────────────────────────────────────────

const PIE_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#f97316'];

const AVATAR_COLORS = ['bg-blue-500', 'bg-violet-500', 'bg-emerald-500', 'bg-rose-500'];

// ─── Tooltips ─────────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label, formatter }: {
  active?: boolean;
  payload?: Array<{ value: number; name?: string }>;
  label?: string;
  formatter?: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-canvas border border-ui-border rounded-lg px-3 py-2 shadow-md">
      {label && <p className="text-[11px] text-fg-subtle mb-1">{label}</p>}
      <p className="text-[13px] font-semibold text-fg">
        {formatter ? formatter(payload[0].value) : payload[0].value.toLocaleString()}
      </p>
    </div>
  );
}

function PieTooltip({ active, payload }: { active?: boolean; payload?: Array<any> }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-canvas border border-ui-border rounded-lg px-3 py-2 shadow-md">
      <p className="text-[11px] text-fg-muted">{payload[0].name?.replace(/_/g, ' ')}</p>
      <p className="text-[13px] font-semibold text-fg">{payload[0].value.toLocaleString()}</p>
      <p className="text-[11px] text-fg-subtle">{payload[0].payload.percentage}%</p>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function ChartSkeleton({ height = 240 }: { height?: number }) {
  return (
    <div className="flex items-end gap-1.5 px-2" style={{ height }}>
      {[55, 75, 42, 88, 68, 52, 82, 38, 72, 62, 48, 85].map((h, i) => (
        <div
          key={i}
          className="flex-1 bg-shimmer rounded-t-sm animate-pulse"
          style={{ height: `${h}%`, animationDelay: `${i * 0.05}s` }}
        />
      ))}
    </div>
  );
}

function ChartEmpty({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 text-fg-subtle" style={{ height: 240 }}>
      <BarChart2 size={28} strokeWidth={1.2} />
      <span className="text-sm text-fg-muted">{label}</span>
    </div>
  );
}

// ─── Chart card shell ─────────────────────────────────────────────────────────

const iconAccent: Record<string, string> = {
  blue:    'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400',
  violet:  'bg-violet-50 text-violet-600 dark:bg-violet-900/20 dark:text-violet-400',
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400',
  amber:   'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400',
};

function ChartCard({
  title, subtitle, icon, color = 'blue', children, className,
}: {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  color?: 'blue' | 'violet' | 'emerald' | 'amber';
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('bg-canvas border border-ui-border rounded-xl overflow-hidden flex flex-col', className)}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-ui-border">
        <div className="flex items-center gap-2.5">
          <div className={cn('p-1.5 rounded-lg', iconAccent[color])}>{icon}</div>
          <div>
            <p className="text-[13px] font-semibold text-fg">{title}</p>
            {subtitle && <p className="text-[11px] text-fg-subtle mt-0.5">{subtitle}</p>}
          </div>
        </div>
      </div>
      <div className="px-5 pb-5 pt-4 flex-1">{children}</div>
    </div>
  );
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

const kpiAccent = [
  { icon: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400',       pill: 'bg-blue-50 text-blue-700 border border-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800' },
  { icon: 'bg-violet-50 text-violet-600 dark:bg-violet-900/20 dark:text-violet-400', pill: 'bg-violet-50 text-violet-700 border border-violet-100 dark:bg-violet-900/20 dark:text-violet-400 dark:border-violet-800' },
  { icon: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400', pill: 'bg-emerald-50 text-emerald-700 border border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800' },
  { icon: 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400',   pill: 'bg-amber-50 text-amber-700 border border-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800' },
];

function KpiCard({ label, value, sub, icon, index }: {
  label: string; value: string; sub: string; icon: React.ReactNode; index: number;
}) {
  const accent = kpiAccent[index % kpiAccent.length];
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
      whileHover={{ y: -1, transition: { duration: 0.15 } }}
      className="bg-canvas border border-ui-border rounded-xl p-5 hover:border-ui-border hover:shadow-sm transition-all duration-200"
    >
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] font-semibold text-fg-muted uppercase tracking-[0.09em]">{label}</p>
        <div className={cn('p-1.5 rounded-lg', accent.icon)}>{icon}</div>
      </div>
      <p className="text-[30px] font-bold text-fg tracking-tight leading-none mb-3">{value}</p>
      <p className="text-[11px] text-fg-subtle">{sub}</p>
    </motion.div>
  );
}

// ─── Revenue chart ────────────────────────────────────────────────────────────

function RevenueChart() {
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';
  const gridColor  = isDark ? '#1F2937' : '#F3F4F6';
  const tickColor  = isDark ? '#6B7280' : '#9CA3AF';

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.analytics.revenue,
    queryFn:  () => analyticsApi.getRevenue(),
  });

  return (
    <ChartCard title="Revenue" subtitle="Monthly won-deal value" icon={<TrendingUp size={14} strokeWidth={2} />} color="blue" className="h-full">
      {isLoading ? <ChartSkeleton /> : !data?.length ? <ChartEmpty label="No revenue data" /> : (
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={data} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="revFillA" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.12} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
            <XAxis dataKey="month" tick={{ fill: tickColor, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: tickColor, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip content={<ChartTooltip formatter={formatCurrency} />} cursor={{ stroke: 'rgba(59,130,246,0.1)', strokeWidth: 1 }} />
            <Area type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={1.5} fill="url(#revFillA)" dot={false} activeDot={{ r: 3.5, fill: '#3b82f6', strokeWidth: 0 }} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

// ─── Lead Sources donut ───────────────────────────────────────────────────────

function LeadSourcesChart() {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.analytics.leadSources,
    queryFn:  analyticsApi.getLeadSources,
  });

  return (
    <ChartCard title="Lead Sources" subtitle="Acquisition breakdown" icon={<PieIcon size={14} strokeWidth={2} />} color="violet" className="h-full">
      {isLoading ? (
        <div className="flex items-center justify-center" style={{ height: 240 }}>
          <Loader2 size={20} className="animate-spin text-fg-subtle" />
        </div>
      ) : !data?.length ? <ChartEmpty label="No source data" /> : (
        <div className="flex items-center gap-4">
          <ResponsiveContainer width="55%" height={220}>
            <PieChart>
              <Pie data={data} dataKey="count" nameKey="source" cx="50%" cy="50%" outerRadius={82} innerRadius={46} paddingAngle={2} startAngle={90} endAngle={-270}>
                {data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip content={<PieTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex-1 space-y-2.5 min-w-0">
            {data.slice(0, 6).map((item, i) => (
              <div key={i} className="flex items-center gap-2 min-w-0">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                <span className="text-[12px] text-fg-secondary truncate flex-1">
                  {item.source.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c: string) => c.toUpperCase())}
                </span>
                <span className="text-[11px] text-fg-subtle shrink-0 tabular-nums">{item.percentage}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </ChartCard>
  );
}

// ─── Pipeline Funnel ──────────────────────────────────────────────────────────

function PipelineFunnelChart() {
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';
  const gridColor    = isDark ? '#1F2937' : '#F3F4F6';
  const tickMuted    = isDark ? '#6B7280' : '#9CA3AF';
  const tickSecond   = isDark ? '#9CA3AF' : '#6B7280';
  const tooltipBg    = isDark ? '#111827' : '#ffffff';
  const tooltipBdr   = isDark ? '#1F2937' : '#E5E7EB';
  const tooltipTx    = isDark ? '#F9FAFB' : '#111827';

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.analytics.pipelineFunnel,
    queryFn:  () => analyticsApi.getPipelineFunnel(),
  });

  const BAR_COLORS = ['#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe'];

  return (
    <ChartCard title="Pipeline Funnel" subtitle="Open deals per stage" icon={<BarChart2 size={14} strokeWidth={2} />} color="emerald" className="h-full">
      {isLoading ? <ChartSkeleton height={200} /> : !data?.length ? <ChartEmpty label="No pipeline data" /> : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
            <XAxis type="number" tick={{ fill: tickMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis dataKey="stage" type="category" tick={{ fill: tickSecond, fontSize: 11 }} axisLine={false} tickLine={false} width={90} />
            <Tooltip
              contentStyle={{ background: tooltipBg, border: `1px solid ${tooltipBdr}`, borderRadius: 8, fontSize: 12, color: tooltipTx, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', padding: '8px 12px' }}
              cursor={{ fill: 'rgba(59,130,246,0.04)' }}
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={20}>
              {data.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

// ─── Sales Performance ────────────────────────────────────────────────────────

function SalesPerformance() {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.analytics.salesPerformance,
    queryFn:  () => analyticsApi.getSalesPerformance(),
  });

  return (
    <ChartCard title="Sales Performance" subtitle="Top reps this month" icon={<Award size={14} strokeWidth={2} />} color="amber" className="h-full">
      {isLoading ? (
        <div className="space-y-4 mt-1">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3 animate-pulse">
              <div className="w-8 h-8 rounded-full bg-shimmer shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-28 bg-shimmer rounded-full" />
                <div className="h-2 w-16 bg-shimmer-subtle rounded-full" />
              </div>
              <div className="h-3 w-16 bg-shimmer-subtle rounded-full" />
            </div>
          ))}
        </div>
      ) : !data?.length ? (
        <div className="flex flex-col items-center justify-center gap-2 text-fg-subtle py-12">
          <Users size={24} strokeWidth={1.2} />
          <span className="text-sm text-fg-muted">No performance data</span>
        </div>
      ) : (
        <div className="space-y-4 mt-1">
          {(data as SalesRepPerformance[]).map((rep, i) => {
            const maxRevenue = (data as SalesRepPerformance[])[0].revenue || 1;
            const barWidth   = Math.round((rep.revenue / maxRevenue) * 100);
            const initials   = rep.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
            return (
              <div key={rep.userId}>
                <div className="flex items-center gap-3 mb-2">
                  <div className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0',
                    AVATAR_COLORS[i % AVATAR_COLORS.length],
                  )}>
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-semibold text-fg truncate">{rep.name}</span>
                      <span className="text-[12px] font-semibold text-emerald-600 shrink-0 ml-2 tabular-nums">{formatCurrency(rep.revenue)}</span>
                    </div>
                    <span className="text-[11px] text-fg-subtle">{rep.dealsWon} deals won</span>
                  </div>
                </div>
                <div className="h-1.5 bg-shimmer rounded-full overflow-hidden ml-10">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${barWidth}%` }}
                    transition={{ delay: i * 0.1 + 0.2, duration: 0.5, ease: 'easeOut' }}
                    className="h-full rounded-full bg-blue-500"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ChartCard>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { data: revenue  } = useQuery({ queryKey: queryKeys.analytics.revenue,          queryFn: () => analyticsApi.getRevenue() });
  const { data: salesPerf } = useQuery({ queryKey: queryKeys.analytics.salesPerformance, queryFn: () => analyticsApi.getSalesPerformance() });

  const totalRevenue  = revenue?.reduce((s, r) => s + r.revenue, 0) ?? 0;
  const totalDeals    = revenue?.reduce((s, r) => s + r.deals,   0) ?? 0;
  const avgDeal       = totalDeals > 0 ? totalRevenue / totalDeals : 0;
  const topRep        = (salesPerf as SalesRepPerformance[] | undefined)?.[0];

  const kpis = [
    { label: '6-Month Revenue', value: formatCurrency(totalRevenue), sub: `${totalDeals} deals closed`,       icon: <DollarSign size={15} strokeWidth={2} /> },
    { label: 'Deals Closed',    value: totalDeals.toLocaleString(),  sub: 'From revenue chart',               icon: <TrendingUp  size={15} strokeWidth={2} /> },
    { label: 'Avg Deal Size',   value: formatCurrency(avgDeal),      sub: 'Revenue ÷ deals closed',          icon: <Percent     size={15} strokeWidth={2} /> },
    { label: 'Top Rep Revenue', value: formatCurrency(topRep?.revenue ?? 0), sub: topRep?.name ?? '—',       icon: <Award       size={15} strokeWidth={2} /> },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => <KpiCard key={kpi.label} index={i} {...kpi} />)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3"><RevenueChart /></div>
        <div className="lg:col-span-2"><LeadSourcesChart /></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PipelineFunnelChart />
        <SalesPerformance />
      </div>
    </div>
  );
}
