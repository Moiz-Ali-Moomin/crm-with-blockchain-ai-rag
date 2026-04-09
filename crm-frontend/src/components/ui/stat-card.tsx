'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StatCardProps {
  title: string;
  value: string | number;
  displayValue?: string;
  sub?: string;
  icon: React.ReactNode;
  index?: number;
  trend?: {
    direction: 'up' | 'down' | 'flat';
    value: string;
    label?: string;
  };
  /** Accent preset (1–4) — controls icon color only */
  gradient?: 1 | 2 | 3 | 4;
  className?: string;
}

const iconAccentClasses = [
  'bg-blue-50 text-blue-600',
  'bg-emerald-50 text-emerald-600',
  'bg-violet-50 text-violet-600',
  'bg-amber-50 text-amber-600',
] as const;

const trendConfig = {
  up:   { icon: TrendingUp,   pill: 'bg-emerald-50 text-emerald-700 border border-emerald-100', text: 'text-emerald-700' },
  down: { icon: TrendingDown, pill: 'bg-rose-50 text-rose-600 border border-rose-100',         text: 'text-rose-600' },
  flat: { icon: Minus,        pill: 'bg-gray-100 text-gray-500 border border-gray-200',         text: 'text-gray-500' },
};

const cardVariants = {
  hidden:  { opacity: 0, y: 10 },
  visible: (index: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: index * 0.06,
      duration: 0.26,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  }),
};

export function StatCard({
  title,
  value,
  displayValue,
  sub,
  icon,
  index = 0,
  trend,
  gradient,
  className,
}: StatCardProps) {
  const ref        = useRef<HTMLDivElement>(null);
  const isInView   = useInView(ref, { once: true, margin: '-40px' });
  const accentIdx  = ((gradient ?? 1) - 1) % 4;
  const iconAccent = iconAccentClasses[accentIdx];
  const trendCfg   = trend ? trendConfig[trend.direction] : null;
  const TrendIcon  = trendCfg?.icon ?? null;

  return (
    <motion.div
      ref={ref}
      custom={index}
      variants={cardVariants}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      whileHover={{ y: -1, transition: { duration: 0.15 } }}
      className={cn(
        'bg-white border border-gray-200 rounded-xl p-5',
        'hover:border-gray-300 hover:shadow-sm',
        'transition-all duration-200 cursor-default',
        className,
      )}
    >
      {/* Header row: label + icon */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.09em]">
          {title}
        </p>
        <div className={cn('p-1.5 rounded-lg shrink-0', iconAccent)}>
          {icon}
        </div>
      </div>

      {/* Value */}
      <p className="text-[30px] font-bold text-gray-900 tracking-tight leading-none mb-3">
        {displayValue ?? value}
      </p>

      {/* Trend pill or sub-label */}
      <div className="flex items-center gap-2 min-h-[20px]">
        {trend && trendCfg && TrendIcon ? (
          <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold', trendCfg.pill)}>
            <TrendIcon size={11} strokeWidth={2.5} />
            {trend.value}
          </span>
        ) : null}
        {trend?.label && (
          <span className="text-[11px] text-gray-400">{trend.label}</span>
        )}
        {!trend && sub ? (
          <span className="text-[11px] text-gray-400">{sub}</span>
        ) : null}
      </div>
    </motion.div>
  );
}
