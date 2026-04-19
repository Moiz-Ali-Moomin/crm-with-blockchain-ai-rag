'use client';

/**
 * Deals Page (Refactored)
 *
 * Before: 239 lines — inline form, inline mutations, inline column defs, mixed concerns
 * After:  ~60 lines — pure layout orchestration, delegates to feature module
 *
 * This page has ONE job: arrange the feature components and coordinate navigation.
 * All business logic lives in hooks. All UI logic lives in components.
 */

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, LayoutList, LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ErrorBoundary } from '@/components/error-boundary';

// Feature-local imports — everything from the deals feature boundary
import {
  DealModal,
  DealTableSkeleton,
  DealKanbanSkeleton,
} from '@/features/deals';
import { useDeals, useDeleteDeal } from '@/features/deals/hooks';
import { useDealsPageState } from '@/features/deals/hooks/use-deals-page-state';
import { useDealRealtime } from '@/features/deals/hooks/use-deal-realtime';
import { buildDealColumns } from '@/features/deals/components/deal-table-columns';
import { useQuery } from '@tanstack/react-query';
import { pipelinesApi } from '@/lib/api/pipelines.api';
import { queryKeys } from '@/lib/query/query-keys';
import { DataTable } from '@/components/crm/data-table';
import { KanbanBoard } from '@/components/crm/kanban/kanban-board';
import { Pagination } from '@/components/shared/pagination';
import type { Deal } from '@/features/deals/types/deal.types';

export default function DealsPage() {
  const router = useRouter();

  // ── Client state (UI) ──────────────────────────────────────────────────────
  const {
    view, setView,
    filters, setFilters,
    createModalOpen, openCreateModal, closeCreateModal,
    editingDeal, openEditModal, closeEditModal,
    deletingDealId, openDeleteConfirm, closeDeleteConfirm,
  } = useDealsPageState();

  // ── Pipeline for kanban default ────────────────────────────────────────────
  const { data: pipelines = [] } = useQuery({
    queryKey: queryKeys.pipelines.all,
    queryFn:  pipelinesApi.getAll,
    staleTime: 10 * 60_000,
  });
  const defaultPipelineId = pipelines.find((p) => p.isDefault)?.id ?? pipelines[0]?.id ?? '';

  // ── Server state ───────────────────────────────────────────────────────────
  const { data, isLoading } = useDeals(view === 'list' ? filters : undefined);
  const deleteDeal = useDeleteDeal();

  // ── Real-time sync ─────────────────────────────────────────────────────────
  useDealRealtime(defaultPipelineId);

  // ── Stable callbacks (memoized to prevent column re-creation) ─────────────
  const handleView   = useCallback((deal: Deal) => router.push(`/deals/${deal.id}`), [router]);
  const handleEdit   = useCallback((deal: Deal) => openEditModal(deal), [openEditModal]);
  const handleDelete = useCallback((deal: Deal) => {
    if (window.confirm(`Delete "${deal.title}"? This cannot be undone.`)) {
      deleteDeal.mutate(deal.id);
    }
  }, [deleteDeal]);

  const columns = buildDealColumns({ onView: handleView, onDelete: handleDelete });

  const rows = (data as any)?.data ?? [];
  const meta = (data as any)?.meta;

  return (
    <div className="space-y-4">
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {view === 'list' && (
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                placeholder="Search deals…"
                className="pl-8 w-52 h-9 rounded-lg border border-ui-border bg-canvas text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 transition-all"
                value={filters.search}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value, page: 1 }))}
              />
            </div>
          )}

          {/* View toggle */}
          <div className="flex items-center border border-ui-border rounded-lg overflow-hidden">
            <button
              onClick={() => setView('list')}
              className={cn('p-2.5 transition-colors', view === 'list' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600' : 'hover:bg-canvas-subtle text-fg-subtle')}
              aria-label="List view"
            >
              <LayoutList size={15} />
            </button>
            <button
              onClick={() => setView('kanban')}
              className={cn('p-2.5 transition-colors', view === 'kanban' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600' : 'hover:bg-canvas-subtle text-fg-subtle')}
              aria-label="Kanban view"
            >
              <LayoutGrid size={15} />
            </button>
          </div>
        </div>

        <button
          onClick={openCreateModal}
          className="flex items-center gap-1.5 px-4 h-9 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
        >
          <Plus size={14} />
          New Deal
        </button>
      </div>

      {/* ── Content ── */}
      <ErrorBoundary context="Deals List">
        {view === 'list' ? (
          <>
            {isLoading ? (
              <DealTableSkeleton rows={8} />
            ) : (
              <DataTable
                columns={columns}
                data={rows}
                isLoading={false}
                emptyMessage="No deals found. Create your first deal to get started."
                onRowClick={(row) => router.push(`/deals/${row.id}`)}
              />
            )}
            {meta && (
              <Pagination
                page={meta.page}
                totalPages={meta.totalPages}
                total={meta.total}
                limit={meta.limit}
                onPageChange={(p) => setFilters((f) => ({ ...f, page: p }))}
              />
            )}
          </>
        ) : (
          <ErrorBoundary context="Deals Kanban">
            {defaultPipelineId ? (
              <KanbanBoard pipelineId={defaultPipelineId} />
            ) : (
              <DealKanbanSkeleton columns={4} />
            )}
          </ErrorBoundary>
        )}
      </ErrorBoundary>

      {/* ── Modals ── */}
      {createModalOpen && (
        <DealModal
          defaultPipelineId={defaultPipelineId}
          onClose={closeCreateModal}
        />
      )}
      {editingDeal && (
        <DealModal
          deal={editingDeal}
          onClose={closeEditModal}
        />
      )}
    </div>
  );
}
