/**
 * DealStatusBadge — Feature-local, domain-driven status badge.
 *
 * Uses getDealStatusConfig() transformer — if the backend adds a new status,
 * only deal.transformers.ts needs updating, not this component.
 *
 * Pure presentational — no hooks, no API calls.
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { getDealStatusConfig } from '../domain/deal.transformers';
import type { DealStatus } from '../types/deal.types';

interface DealStatusBadgeProps {
  status: DealStatus;
  size?: 'sm' | 'md';
  className?: string;
}

export const DealStatusBadge = React.memo(function DealStatusBadge({
  status,
  size = 'md',
  className,
}: DealStatusBadgeProps) {
  const config = getDealStatusConfig(status);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-medium rounded-full',
        size === 'sm'
          ? 'px-2 py-0.5 text-[10px]'
          : 'px-2.5 py-1 text-xs',
        config.bg,
        config.text,
        className,
      )}
    >
      {/* Status dot */}
      <span
        className={cn('rounded-full shrink-0', config.accent, size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2')}
        aria-hidden="true"
      />
      {config.label}
    </span>
  );
});
