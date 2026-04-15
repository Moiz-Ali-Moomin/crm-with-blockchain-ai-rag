/**
 * useDealsPageState
 *
 * Manages CLIENT-SIDE state for the Deals page:
 *   - View toggle (list / kanban)
 *   - Filter state
 *   - Modal open/close
 *
 * This is explicitly NOT server state — it lives here, not in React Query.
 * Keeping it in a hook means the page component drops to pure JSX layout.
 */

'use client';

import { useState, useCallback } from 'react';
import type { DealView, Deal, DealsFilters } from '../types/deal.types';
import { DEFAULT_DEALS_FILTERS } from '../types/deal.types';

interface DealsPageState {
  // View
  view: DealView;
  setView: (view: DealView) => void;

  // Filters
  filters: DealsFilters;
  setFilters: (updater: (prev: DealsFilters) => DealsFilters) => void;
  resetFilters: () => void;

  // Create modal
  createModalOpen: boolean;
  openCreateModal: () => void;
  closeCreateModal: () => void;

  // Edit modal
  editingDeal: Deal | null;
  openEditModal: (deal: Deal) => void;
  closeEditModal: () => void;

  // Delete confirm
  deletingDealId: string | null;
  openDeleteConfirm: (id: string) => void;
  closeDeleteConfirm: () => void;
}

export function useDealsPageState(): DealsPageState {
  const [view, setView]                   = useState<DealView>('list');
  const [filters, setFilters]             = useState<DealsFilters>(DEFAULT_DEALS_FILTERS);
  const [createModalOpen, setCreateModal] = useState(false);
  const [editingDeal, setEditingDeal]     = useState<Deal | null>(null);
  const [deletingDealId, setDeletingId]   = useState<string | null>(null);

  const resetFilters     = useCallback(() => setFilters(DEFAULT_DEALS_FILTERS), []);
  const openCreateModal  = useCallback(() => setCreateModal(true), []);
  const closeCreateModal = useCallback(() => setCreateModal(false), []);
  const openEditModal    = useCallback((deal: Deal) => setEditingDeal(deal), []);
  const closeEditModal   = useCallback(() => setEditingDeal(null), []);
  const openDeleteConfirm  = useCallback((id: string) => setDeletingId(id), []);
  const closeDeleteConfirm = useCallback(() => setDeletingId(null), []);

  return {
    view,
    setView,
    filters,
    setFilters,
    resetFilters,
    createModalOpen,
    openCreateModal,
    closeCreateModal,
    editingDeal,
    openEditModal,
    closeEditModal,
    deletingDealId,
    openDeleteConfirm,
    closeDeleteConfirm,
  };
}
