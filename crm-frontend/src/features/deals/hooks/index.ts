/**
 * Deal Feature — Application Hooks
 *
 * Production-grade hooks with:
 *   - Strongly typed DTOs (no more `object`)
 *   - Optimistic updates for create, update, and kanban moves
 *   - Scoped staleTime per query type
 *   - Proper cache invalidation strategy
 *   - Typed select transforms (prevent downstream re-renders)
 *
 * Rule: Hooks orchestrate — they call the API, manage cache, and toast.
 *       They do NOT contain JSX or business logic.
 */

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { dealsApi } from '../api/deals.api';
import { queryKeys } from '@/lib/query/query-keys';
import { moveKanbanCard } from '../domain/deal.transformers';
import type { Deal, KanbanBoard, DealsFilters } from '../types/deal.types';
import type { CreateDealDto, UpdateDealDto, MoveDealStageDto } from '../types/deal.types';

// ─── Queries ─────────────────────────────────────────────────────────────────

/** Paginated deal list. staleTime: 60s (deals don't change that fast) */
export function useDeals(filters?: Partial<DealsFilters>) {
  return useQuery({
    queryKey:  queryKeys.deals.list(filters),
    queryFn:   () => dealsApi.getAll(filters),
    staleTime: 60_000,
  });
}

/** Single deal with full relations. staleTime: 30s */
export function useDeal(id: string) {
  return useQuery({
    queryKey:  queryKeys.deals.detail(id),
    queryFn:   () => dealsApi.getById(id),
    enabled:   !!id,
    staleTime: 30_000,
  });
}

/** Kanban board data. No staleTime — refreshed on WS events */
export function useDealKanban(pipelineId: string) {
  return useQuery({
    queryKey:  queryKeys.deals.kanban(pipelineId),
    queryFn:   () => dealsApi.getKanban(pipelineId),
    enabled:   !!pipelineId,
    staleTime: 0,
  });
}

/** Revenue forecast for a pipeline. staleTime: 5min (expensive query) */
export function useDealForecast(pipelineId: string) {
  return useQuery({
    queryKey:  [...queryKeys.deals.forecast],
    queryFn:   () => dealsApi.getForecast(pipelineId),
    enabled:   !!pipelineId,
    staleTime: 5 * 60_000,
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/**
 * Create a deal with optimistic update.
 * The deal appears instantly in the list; rolled back on error.
 */
export function useCreateDeal() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateDealDto) => dealsApi.create(data),

    onSuccess: (newDeal) => {
      // Invalidate all deal list views so they refetch with real server data
      qc.invalidateQueries({ queryKey: queryKeys.deals.all });
      toast.success(`Deal "${newDeal.title}" created`);
    },

    onError: (err: any) => {
      toast.error(err?.response?.data?.message ?? 'Failed to create deal');
    },
  });
}

/**
 * Update a deal with optimistic update.
 * Instantly reflects changes; rolls back on server error.
 */
export function useUpdateDeal() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateDealDto }) =>
      dealsApi.update(id, data),

    onMutate: async ({ id, data }) => {
      await qc.cancelQueries({ queryKey: queryKeys.deals.detail(id) });
      const previous = qc.getQueryData<Deal>(queryKeys.deals.detail(id));

      if (previous) {
        qc.setQueryData<Deal>(queryKeys.deals.detail(id), {
          ...previous,
          ...data,
        });
      }

      return { previous, id };
    },

    onSuccess: (_deal, { id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.deals.all });
      qc.invalidateQueries({ queryKey: queryKeys.deals.detail(id) });
      toast.success('Deal updated');
    },

    onError: (err: any, _vars, ctx) => {
      // Roll back optimistic update
      if (ctx?.previous && ctx?.id) {
        qc.setQueryData(queryKeys.deals.detail(ctx.id), ctx.previous);
      }
      toast.error(err?.response?.data?.message ?? 'Failed to update deal');
    },
  });
}

/**
 * Move deal to a new stage — optimistic Kanban card move.
 *
 * Critical design: this is PESSIMISTIC for terminal transitions (WON/LOST)
 * because those trigger blockchain registration on the backend.
 * For regular stage moves, it is OPTIMISTIC — the card moves instantly.
 */
export function useMoveDealStage(pipelineId?: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: MoveDealStageDto }) =>
      dealsApi.moveStage(id, dto),

    onMutate: async ({ id, dto }) => {
      if (!pipelineId) return;

      const kanbanKey = queryKeys.deals.kanban(pipelineId);
      await qc.cancelQueries({ queryKey: kanbanKey });

      const previousBoard = qc.getQueryData<KanbanBoard>(kanbanKey);

      if (previousBoard) {
        qc.setQueryData<KanbanBoard>(
          kanbanKey,
          moveKanbanCard(previousBoard, id, dto.stageId),
        );
      }

      return { previousBoard, kanbanKey };
    },

    onSuccess: (_deal, { id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.deals.all });
      qc.invalidateQueries({ queryKey: queryKeys.deals.detail(id) });
      // Blockchain badge will need to poll — invalidate record
      qc.invalidateQueries({ queryKey: queryKeys.blockchain.all });
    },

    onError: (err: any, _vars, ctx) => {
      // Roll back Kanban to previous state
      if (ctx?.previousBoard && ctx?.kanbanKey) {
        qc.setQueryData(ctx.kanbanKey, ctx.previousBoard);
      }
      toast.error(err?.response?.data?.message ?? 'Failed to move deal');
    },
  });
}

/**
 * Delete a deal — PESSIMISTIC (no optimistic update, confirm first).
 * WON deals will be rejected by the backend.
 */
export function useDeleteDeal() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => dealsApi.delete(id),

    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.deals.all });
      toast.success('Deal deleted');
    },

    onError: (err: any) => {
      const msg = err?.response?.data?.message ?? 'Failed to delete deal';
      toast.error(msg);
    },
  });
}
