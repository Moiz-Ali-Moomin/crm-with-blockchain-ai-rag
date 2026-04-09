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
import { TrendingUp, BarChart2, Loader2 } from 'lucide-react';

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
    <div className="bg-[#111827] border border-gray-700/80 rounded-lg px-3 py-2 shadow-xl">
      <p className="text-gray-400 text-[11px] mb-1">{label}</p>
      <p className="text-white text-sm font-semibold">{formatCurrency(payload[0].value)}</p>
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
          className="flex-1 bg-gray-700/40 rounded-t-sm animate-pulse"
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
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <div className="bg-[#1f2937] border border-gray-700/60 rounded-xl p-5">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400">
            {icon}
          </div>
          <span className="text-sm font-semibold text-white">{title}</span>
        </div>
        {badge}
      </div>
      {children}
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
      badge={<span className="text-[11px] text-gray-500 font-medium">12 months</span>}
    >
      {isLoading ? (
        <ChartSkeleton />
      ) : !data?.length ? (
        <div className="h-52 flex items-center justify-center text-gray-500 text-sm">
          No revenue data yet
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={208}>
          <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(75,85,99,0.35)"
              vertical={false}
            />
            <XAxis
              dataKey="month"
              tick={{ fill: '#6b7280', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#6b7280', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip
              content={<AreaTooltip />}
              cursor={{ stroke: 'rgba(59,130,246,0.15)', strokeWidth: 1 }}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="#3b82f6"
              strokeWidth={2}
              fill="url(#revGrad)"
              dot={false}
              activeDot={{ r: 4, fill: '#3b82f6', strokeWidth: 0 }}
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
    >
      {isLoading ? (
        <div className="h-52 flex items-center justify-center">
          <Loader2 size={20} className="text-gray-600 animate-spin" />
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
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } }}
      className="grid grid-cols-1 lg:grid-cols-2 gap-4"
    >
      <RevenueChart />
      <PipelineChart />
    </motion.div>
  );
}
