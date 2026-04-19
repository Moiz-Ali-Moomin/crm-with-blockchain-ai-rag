'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { useThemeStore } from '@/store/theme.store';
import type { PipelineFunnelStage } from '@/types';

interface Props {
  data: PipelineFunnelStage[];
  height?: number;
}

const BAR_COLORS = ['#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe'];

export function PipelineFunnelChart({ data, height = 240 }: Props) {
  const theme      = useThemeStore((s) => s.theme);
  const gridColor  = theme === 'dark' ? '#1F2937' : '#F3F4F6';
  const tickMuted  = theme === 'dark' ? '#9CA3AF' : '#9CA3AF';
  const tickSecond = theme === 'dark' ? '#6B7280' : '#6B7280';
  const tooltipBg  = theme === 'dark' ? '#1F2937' : '#ffffff';
  const tooltipBdr = theme === 'dark' ? '#374151' : '#E5E7EB';
  const tooltipTx  = theme === 'dark' ? '#F9FAFB' : '#111827';
  const tooltipLbl = theme === 'dark' ? '#9CA3AF' : '#6B7280';

  if (!data.length) {
    return (
      <div style={{ height }} className="flex flex-col items-center justify-center gap-2 text-fg-subtle">
        <div className="w-8 h-8 rounded-full bg-shimmer-subtle flex items-center justify-center">
          <span className="text-xs text-fg-subtle">—</span>
        </div>
        <span className="text-sm">No pipeline data</span>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
        <XAxis type="number" tick={{ fill: tickMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis dataKey="stage" type="category" tick={{ fill: tickSecond, fontSize: 11 }} axisLine={false} tickLine={false} width={90} />
        <Tooltip
          cursor={{ fill: 'rgba(59,130,246,0.04)' }}
          contentStyle={{
            background: tooltipBg,
            border: `1px solid ${tooltipBdr}`,
            borderRadius: '8px',
            fontSize: '12px',
            color: tooltipTx,
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            padding: '8px 12px',
          }}
          labelStyle={{ color: tooltipLbl, marginBottom: 2 }}
        />
        <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={22}>
          {data.map((_, i) => (
            <Cell key={`cell-${i}`} fill={BAR_COLORS[i % BAR_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
