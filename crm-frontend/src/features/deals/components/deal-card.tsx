/**
 * DealCard — Pure presentational Kanban card.
 *
 * Design rules:
 *   - No API calls
 *   - No query hooks
 *   - Props-only: accepts a Deal and event callbacks
 *   - React.memo to prevent re-renders from unrelated Kanban state
 *   - isDragging state handled by parent (dnd-kit)
 */

import React from 'react';
import { Building2, User, Calendar, MoreHorizontal, Eye, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDealValue, getDealOwnerName, getDealContactName, isDealTerminal } from '../domain/deal.transformers';
import { DealStatusBadge } from './deal-status-badge';
import type { Deal } from '../types/deal.types';

interface DealCardProps {
  deal: Deal;
  isDragging?: boolean;
  onView?: (deal: Deal) => void;
  onEdit?: (deal: Deal) => void;
  onDelete?: (deal: Deal) => void;
  /** If true, drag handle is shown on the card */
  draggable?: boolean;
}

export const DealCard = React.memo(function DealCard({
  deal,
  isDragging = false,
  onView,
  onEdit,
  onDelete,
  draggable = true,
}: DealCardProps) {
  const ownerName    = getDealOwnerName(deal);
  const contactName  = getDealContactName(deal);
  const isTerminal   = isDealTerminal(deal);
  const formattedVal = formatDealValue(deal.value, deal.currency ?? 'USD');

  return (
    <div
      className={cn(
        'group bg-white rounded-xl border border-slate-200 p-3.5 cursor-pointer',
        'transition-all duration-150 select-none',
        'hover:border-blue-200 hover:shadow-md',
        isDragging && 'rotate-1 shadow-xl border-blue-300 opacity-90',
        isTerminal && 'opacity-70',
      )}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <h3 className="text-[13px] font-semibold text-slate-900 leading-snug line-clamp-2 flex-1">
          {deal.title}
        </h3>

        {/* Actions dropdown (visible on hover) */}
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 shrink-0">
          {onView && (
            <button
              onClick={(e) => { e.stopPropagation(); onView(deal); }}
              className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              aria-label="View deal"
            >
              <Eye size={12} />
            </button>
          )}
          {onEdit && !isTerminal && (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(deal); }}
              className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              aria-label="Edit deal"
            >
              <Pencil size={12} />
            </button>
          )}
          {onDelete && !isTerminal && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(deal); }}
              className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50"
              aria-label="Delete deal"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Value */}
      <p className="text-base font-bold text-emerald-600 mb-3 tabular-nums">
        {formattedVal}
      </p>

      {/* Meta row */}
      <div className="space-y-1.5">
        {contactName && (
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <User size={11} className="shrink-0" />
            <span className="truncate">{contactName}</span>
          </div>
        )}
        {deal.company && (
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <Building2 size={11} className="shrink-0" />
            <span className="truncate">{deal.company.name}</span>
          </div>
        )}
        {deal.closingDate && (
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <Calendar size={11} className="shrink-0" />
            <span>{new Date(deal.closingDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
        <DealStatusBadge status={deal.status} size="sm" />

        {/* Stage probability */}
        {deal.stage && (
          <span className="text-[10px] text-slate-400 tabular-nums">
            {Math.round((deal.stage.probability ?? 0) * 100)}%
          </span>
        )}
      </div>
    </div>
  );
});
