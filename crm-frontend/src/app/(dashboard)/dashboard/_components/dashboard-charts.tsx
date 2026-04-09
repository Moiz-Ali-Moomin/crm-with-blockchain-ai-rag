'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import { analyticsApi } from '@/lib/api/analytics.api';
import { queryKeys } from '@/lib/query/query-keys';
import { PipelineFunnelChart } from '@/components/charts/pipeline-funnel-chart';
import { formatCurrency } from '@/lib/utils';
import { TrendingUp, BarChart2, Loader2, ArrowUpRight } from 'lucide-react';

// ── Tooltip ──────────────────────────────────────────────────────────────────

function AreaTooltip({
  active, payload, label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-md">
      <p className="text-gray-400 text-[11px] mb-1">{label}</p>
      <p className="text-gray-900 text-[13px] font-semibold">{formatCurrency(payload[0].value)}</p>
    </div>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function ChartSkeleton() {
  return (
    <div className="h-52 flex items-end gap-1.5 px-2 pt-4">
      {[60, 80, 45, 90, 70, 55, 85, 40, 75, 65, 50, 88].map((h, i) => (
        <div
          key={i}
          className="flex-1 bg-gray-100 rounded-t-sm animate-pulse"
          style={{ height: `${h}%`, animationDelay: `${i * 0.04}s` }}
        />
      ))}
    </div>
  );
}

// ── Shared card shell ─────────────────────────────────────────────────────────

function ChartCard({
  title,
  icon,
  children,
  badge,
  action,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  badge?: React.ReactNode;
  action?: { label: string; href?: string };
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Card header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-blue-50">
            <span className="text-blue-600">{icon}</span>
          </div>
          <span className="text-[13px] font-semibold text-gray-900">{title}</span>
        </div>
        <div className="flex items-center gap-3">
          {badge && (
            <span className="text-[11px] text-gray-400 font-medium">{badge}</span>
          )}
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
      </div>

      {/* Chart body */}
      <div className="px-4 pt-4 pb-5">
        {children}
      </div>
    </div>
  );
}

// ── Revenue area chart ───────────────────────────────────────────────────────

function RevenueChart() {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.analytics.revenue,
    queryFn:  () => analyticsApi.getRevenue(),
  });

  return (
    <ChartCard
      title="Revenue"
      icon={<TrendingUp size={14} strokeWidth={2} />}
      badge="Last 12 months"
      action={{ label: 'Full report', href: '/analytics' }}
    >
      {isLoading ? (
        <ChartSkeleton />
      ) : !data?.length ? (
        <div className="h-52 flex flex-col items-center justify-center gap-2 text-gray-400">
          <TrendingUp size={24} strokeWidth={1.5} className="text-gray-300" />
          <span className="text-sm">No revenue data yet</span>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={208}>
          <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.12} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#F3F4F6"
              vertical={false}
            />
            <XAxis
              dataKey="month"
              tick={{ fill: '#9CA3AF', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#9CA3AF', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip
              content={<AreaTooltip />}
              cursor={{ stroke: 'rgba(59,130,246,0.1)', strokeWidth: 1 }}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="#3b82f6"
              strokeWidth={1.5}
              fill="url(#revGrad)"
              dot={false}
              activeDot={{ r: 3.5, fill: '#3b82f6', strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

// ── Pipeline funnel chart ────────────────────────────────────────────────────

function PipelineChart() {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.analytics.pipelineFunnel,
    queryFn:  () => analyticsApi.getPipelineFunnel(),
  });

  return (
    <ChartCard
      title="Pipeline Funnel"
      icon={<BarChart2 size={14} strokeWidth={2} />}
      action={{ label: 'View pipeline', href: '/pipeline' }}
    >
      {isLoading ? (
        <div className="h-52 flex items-center justify-center">
          <Loader2 size={18} className="text-gray-300 animate-spin" />
        </div>
      ) : (
        <PipelineFunnelChart data={data ?? []} height={208} />
      )}
    </ChartCard>
  );
}

// ── Export ───────────────────────────────────────────────────────────────────

export function DashboardCharts() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] } }}
      className="grid grid-cols-1 lg:grid-cols-2 gap-4"
    >
      <RevenueChart />
      <PipelineChart />
    </motion.div>
  );
}
