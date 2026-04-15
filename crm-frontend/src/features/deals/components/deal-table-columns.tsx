/**
 * Deal Table Column Definitions
 *
 * Extracted from deals/page.tsx where they were inlined (causing re-renders
 * since a new array reference was created on every render).
 *
 * These are stable references defined at module scope.
 * Components receive them via import — not recreated per render.
 */

import { Eye, Trash2 } from 'lucide-react';
import { formatDealValue } from '../domain/deal.transformers';
import { DealStatusBadge } from './deal-status-badge';
import type { Deal } from '../types/deal.types';

// ─── Column definition type (matches DataTable's ColumnDef) ──────────────────

export interface ColumnDef<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
}

// ─── Column factory ──────────────────────────────────────────────────────────
// Accepts callbacks so columns can trigger mutations / navigation.
// The factory itself is stable — only the callbacks may change (and they should be useCallback-wrapped).

export interface DealColumnCallbacks {
  onView:   (deal: Deal) => void;
  onDelete: (deal: Deal) => void;
}

export function buildDealColumns(callbacks: DealColumnCallbacks): ColumnDef<Deal>[] {
  return [
    {
      key:    'title',
      header: 'Title',
      render: (row) => (
        <span className="text-[13px] font-semibold text-slate-900">
          {row.title}
        </span>
      ),
    },
    {
      key:    'contact',
      header: 'Contact',
      render: (row) =>
        row.contact
          ? `${row.contact.firstName} ${row.contact.lastName}`
          : '—',
    },
    {
      key:    'company',
      header: 'Company',
      render: (row) => row.company?.name ?? '—',
    },
    {
      key:    'stage',
      header: 'Stage',
      render: (row) => row.stage?.name ?? '—',
    },
    {
      key:    'value',
      header: 'Value',
      render: (row) => (
        <span className="text-[13px] font-semibold text-emerald-600 tabular-nums">
          {formatDealValue(row.value, row.currency ?? 'USD')}
        </span>
      ),
    },
    {
      key:    'status',
      header: 'Status',
      render: (row) => <DealStatusBadge status={row.status} />,
    },
    {
      key:    'closingDate',
      header: 'Closing',
      render: (row) =>
        row.closingDate
          ? new Date(row.closingDate).toLocaleDateString('en-US', {
              month: 'short',
              day:   'numeric',
              year:  'numeric',
            })
          : '—',
    },
    {
      key:    'actions',
      header: '',
      render: (row) => (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); callbacks.onView(row); }}
            className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="View deal"
          >
            <Eye size={14} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); callbacks.onDelete(row); }}
            className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
            aria-label="Delete deal"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ];
}
