'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StatCardProps {
  title: string;
  value: string | number;
  /** Formatted display value, e.g. "1,204" or "$32,450" */
  displayValue?: string;
  sub?: string;
  icon: React.ReactNode;
  /** Stagger delay index */
  index?: number;
  trend?: {
    direction: 'up' | 'down' | 'flat';
    value: string;
    label?: string;
  };
  /** Accent preset (1–4) — controls icon color only, no card gradient */
  gradient?: 1 | 2 | 3 | 4;
  className?: string;
}

const iconAccentClasses = [
  'bg-blue-500/10 text-blue-400',
  'bg-emerald-500/10 text-emerald-400',
  'bg-violet-500/10 text-violet-400',
  'bg-amber-500/10 text-amber-400',
] as const;

const trendConfig = {
  up:   { icon: TrendingUp,   className: 'text-emerald-400' },
  down: { icon: TrendingDown, className: 'text-rose-400' },
  flat: { icon: Minus,        className: 'text-gray-500' },
};

const cardVariants = {
  hidden:  { opacity: 0, y: 14 },
  visible: (index: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: index * 0.07,
      duration: 0.3,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  }),
};

/**
 * StatCard — minimal KPI card for the CRM dashboard.
 *
 * Flat dark surface (#1f2937) with a single accent color on the icon.
 * No gradients, no blur — built for readability at a glance.
 */
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
  const ref          = useRef<HTMLDivElement>(null);
  const isInView     = useInView(ref, { once: true, margin: '-40px' });
  const accentIdx    = ((gradient ?? 1) - 1) % 4;
  const iconAccent   = iconAccentClasses[accentIdx];
  const TrendIcon    = trend ? trendConfig[trend.direction].icon : null;
  const trendClass   = trend ? trendConfig[trend.direction].className : '';

  return (
    <motion.div
      ref={ref}
      custom={index}
      variants={cardVariants}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      whileHover={{ y: -2, transition: { duration: 0.15 } }}
      className={cn(
        'bg-[#1f2937] border border-gray-700/60 rounded-xl p-5',
        'hover:border-gray-600/80 hover:bg-[#243044]',
        'transition-colors duration-200 cursor-default',
        className,
      )}
    >
      {/* Label + icon */}
      <div className="flex items-start justify-between mb-4">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider leading-none pt-0.5">
          {title}
        </p>
        <div className={cn('p-2 rounded-lg shrink-0', iconAccent)}>
          {icon}
        </div>
      </div>

      {/* Value */}
      <p className="text-[28px] font-bold text-white tracking-tight leading-none mb-3">
        {displayValue ?? value}
      </p>

      {/* Trend / sub */}
      <div className="flex items-center gap-1.5 min-h-[18px]">
        {trend && TrendIcon ? (
          <>
            <TrendIcon size={13} className={trendClass} strokeWidth={2.5} />
            <span className={cn('text-xs font-semibold', trendClass)}>
              {trend.value}
            </span>
            {trend.label && (
              <span className="text-xs text-gray-500">{trend.label}</span>
            )}
          </>
        ) : sub ? (
          <span className="text-xs text-gray-500">{sub}</span>
        ) : null}
      </div>
    </motion.div>
  );
}
