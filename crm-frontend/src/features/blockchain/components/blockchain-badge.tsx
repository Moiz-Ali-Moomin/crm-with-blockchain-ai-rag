/**
 * BlockchainBadge — On-chain verification status indicator.
 *
 * Shows the current blockchain registration status for a WON deal.
 * Automatically polls (via useDealVerification) while PENDING.
 *
 * States:
 *   PENDING   → animated spinner, "Registering on-chain…"
 *   CONFIRMED → green checkmark, tx hash link (Polygonscan)
 *   FAILED    → red badge, retry option
 *   null      → nothing rendered (deal is not WON)
 */

'use client';

import React from 'react';
import { Loader2, CheckCircle2, XCircle, ExternalLink, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDealVerification } from '../hooks/use-deal-verification';

interface BlockchainBadgeProps {
  dealId: string;
  /** Show compact version (no text, just icon + tooltip) */
  compact?: boolean;
  className?: string;
}

export function BlockchainBadge({ dealId, compact = false, className }: BlockchainBadgeProps) {
  const { record, isLoading, isPending, isConfirmed, isFailed, txHash, verify, isVerifying } =
    useDealVerification(dealId);

  if (isLoading || !record) return null;

  const EXPLORER_BASE = 'https://polygonscan.com/tx';

  if (isPending) {
    return (
      <div
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
          'bg-amber-50 text-amber-700 border border-amber-200',
          className,
        )}
        title="Blockchain registration in progress"
      >
        <Loader2 size={12} className="animate-spin shrink-0" />
        {!compact && <span>Registering on-chain…</span>}
      </div>
    );
  }

  if (isConfirmed) {
    return (
      <div className={cn('inline-flex items-center gap-1.5', className)}>
        <div
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
            'bg-emerald-50 text-emerald-700 border border-emerald-200',
          )}
          title={`Confirmed on ${record.network} — Block #${record.blockNumber}`}
        >
          <CheckCircle2 size={12} className="shrink-0" />
          {!compact && <span>On-chain verified</span>}
        </div>

        {txHash && (
          <a
            href={`${EXPLORER_BASE}/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-blue-600 transition-colors"
            title="View transaction on Polygonscan"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink size={10} />
            {!compact && <span className="font-mono">{txHash.slice(0, 8)}…</span>}
          </a>
        )}
      </div>
    );
  }

  if (isFailed) {
    return (
      <div className={cn('inline-flex items-center gap-2', className)}>
        <div
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
            'bg-rose-50 text-rose-700 border border-rose-200',
          )}
          title={record.error ?? 'Blockchain registration failed'}
        >
          <XCircle size={12} className="shrink-0" />
          {!compact && <span>Registration failed</span>}
        </div>

        <button
          onClick={() => verify()}
          disabled={isVerifying}
          className="inline-flex items-center gap-1 text-[11px] text-rose-600 hover:text-rose-700 font-medium transition-colors disabled:opacity-50"
          title="Retry verification"
        >
          <RefreshCw size={10} className={isVerifying ? 'animate-spin' : ''} />
          {!compact && <span>Retry</span>}
        </button>
      </div>
    );
  }

  return null;
}
