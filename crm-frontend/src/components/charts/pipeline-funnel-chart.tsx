'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { PipelineFunnelStage } from '@/types';

interface Props {
  data: PipelineFunnelStage[];
  height?: number;
}

export function PipelineFunnelChart({ data, height = 240 }: Props) {
  if (!data.length) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-slate-400 text-sm">
        No data
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="rgba(75,85,99,0.35)"
          horizontal={false}
        />
        <XAxis
          type="number"
          tick={{ fill: '#6b7280', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          dataKey="stage"
          type="category"
          tick={{ fill: '#9ca3af', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={88}
        />
        <Tooltip
          cursor={{ fill: 'rgba(255,255,255,0.03)' }}
          contentStyle={{
            background: '#111827',
            border: '1px solid rgba(75,85,99,0.6)',
            borderRadius: '8px',
            fontSize: '12px',
            color: '#f9fafb',
          }}
        />
        <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
