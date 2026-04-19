import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalPages, total, limit, onPageChange }: PaginationProps) {
  const from = total === 0 ? 0 : Math.min((page - 1) * limit + 1, total);
  const to   = total === 0 ? 0 : Math.min(page * limit, total);
  const safeTotal = total ?? 0;
  const safePages = totalPages || 1;

  return (
    <div className="flex items-center justify-between py-1">
      <p className="text-[12px] text-fg-subtle">
        {safeTotal === 0
          ? 'No results'
          : `Showing ${from}–${to} of ${safeTotal.toLocaleString()}`}
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className={cn(
            'flex items-center gap-1 px-3 h-8 rounded-md border text-[12px] font-medium transition-colors',
            page <= 1
              ? 'border-ui-border-subtle text-fg-subtle cursor-not-allowed bg-canvas'
              : 'border-ui-border text-fg-secondary hover:bg-canvas-subtle hover:text-fg bg-canvas',
          )}
        >
          <ChevronLeft size={13} strokeWidth={2} /> Prev
        </button>
        <span className="text-[12px] text-fg-muted px-2 tabular-nums">
          {page} / {safePages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= safePages}
          className={cn(
            'flex items-center gap-1 px-3 h-8 rounded-md border text-[12px] font-medium transition-colors',
            page >= safePages
              ? 'border-ui-border-subtle text-fg-subtle cursor-not-allowed bg-canvas'
              : 'border-ui-border text-fg-secondary hover:bg-canvas-subtle hover:text-fg bg-canvas',
          )}
        >
          Next <ChevronRight size={13} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
