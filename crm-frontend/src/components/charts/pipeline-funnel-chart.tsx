'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { PipelineFunnelStage } from '@/types';

interface Props {
  data: PipelineFunnelStage[];
  height?: number;
}

const BAR_COLORS = ['#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe'];

export function PipelineFunnelChart({ data, height = 240 }: Props) {
  if (!data.length) {
    return (
      <div style={{ height }} className="flex flex-col items-center justify-center gap-2 text-gray-400">
        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
          <span className="text-xs text-gray-400">—</span>
        </div>
        <span className="text-sm">No pipeline data</span>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="#F3F4F6"
          horizontal={false}
        />
        <XAxis
          type="number"
          tick={{ fill: '#9CA3AF', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          dataKey="stage"
          type="category"
          tick={{ fill: '#6B7280', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={90}
        />
        <Tooltip
          cursor={{ fill: 'rgba(59,130,246,0.04)' }}
          contentStyle={{
            background: '#ffffff',
            border: '1px solid #E5E7EB',
            borderRadius: '8px',
            fontSize: '12px',
            color: '#111827',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            padding: '8px 12px',
          }}
          labelStyle={{ color: '#6B7280', marginBottom: 2 }}
        />
        <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={22}>
          {data.map((_, i) => (
            <Cell
              key={`cell-${i}`}
              fill={BAR_COLORS[i % BAR_COLORS.length]}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
