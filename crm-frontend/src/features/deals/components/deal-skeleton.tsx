/**
 * DealSkeleton — Loading placeholder for the deals list and detail view.
 *
 * Prevents Content Layout Shift (CLS) by rendering content-shaped placeholders
 * before data loads. Each skeleton matches the exact dimensions of the real content.
 */

import { cn } from '@/lib/utils';

// ─── Primitive ───────────────────────────────────────────────────────────────

function Bone({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'bg-slate-200 rounded animate-pulse',
        className,
      )}
      aria-hidden="true"
    />
  );
}

// ─── Deal list row skeleton ──────────────────────────────────────────────────

export function DealRowSkeleton() {
  return (
    <div className="flex items-center gap-4 h-12 px-4 border-b border-slate-100">
      <Bone className="h-4 w-48 flex-shrink-0" />       {/* title */}
      <Bone className="h-4 w-28" />                      {/* contact */}
      <Bone className="h-4 w-24" />                      {/* company */}
      <Bone className="h-4 w-20" />                      {/* stage */}
      <Bone className="h-4 w-16 ml-auto" />              {/* value */}
      <Bone className="h-5 w-14 rounded-full" />         {/* status badge */}
    </div>
  );
}

export function DealTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
      {/* Header */}
      <div className="flex items-center gap-4 h-11 px-4 bg-slate-50 border-b border-slate-200">
        {['w-48', 'w-28', 'w-24', 'w-20', 'w-16', 'w-14'].map((w, i) => (
          <Bone key={i} className={cn('h-3', w)} />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <DealRowSkeleton key={i} />
      ))}
    </div>
  );
}

// ─── Kanban card skeleton ─────────────────────────────────────────────────────

export function DealCardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3.5 space-y-3">
      <Bone className="h-4 w-3/4" />        {/* title */}
      <Bone className="h-5 w-20" />          {/* value */}
      <div className="space-y-2">
        <Bone className="h-3 w-1/2" />      {/* contact */}
        <Bone className="h-3 w-1/3" />      {/* company */}
      </div>
      <div className="flex items-center justify-between pt-3 border-t border-slate-100">
        <Bone className="h-4 w-14 rounded-full" />  {/* badge */}
        <Bone className="h-3 w-6" />                {/* probability */}
      </div>
    </div>
  );
}

export function DealKanbanSkeleton({ columns = 4 }: { columns?: number }) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {Array.from({ length: columns }).map((_, col) => (
        <div key={col} className="flex-shrink-0 w-72 space-y-3">
          {/* Column header */}
          <div className="flex items-center justify-between px-1">
            <Bone className="h-4 w-24" />
            <Bone className="h-4 w-8" />
          </div>
          {/* Cards */}
          {Array.from({ length: col % 2 === 0 ? 3 : 2 }).map((_, i) => (
            <DealCardSkeleton key={i} />
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Deal detail skeleton ─────────────────────────────────────────────────────

export function DealDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Bone className="h-7 w-64" />
          <Bone className="h-4 w-32" />
        </div>
        <Bone className="h-8 w-24 rounded-lg" />
      </div>
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Bone className="h-3 w-16" />
            <Bone className="h-5 w-28" />
          </div>
        ))}
      </div>
    </div>
  );
}
