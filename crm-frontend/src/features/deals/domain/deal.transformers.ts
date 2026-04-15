/**
 * Deal Domain Transformers
 *
 * Pure functions that map between API models and UI models.
 * No side effects. No React. No imports from infrastructure.
 *
 * These are the "business rules" on the frontend — the single place
 * you touch when the API contract or display logic changes.
 */

import type { Deal, DealStatus, KanbanBoard } from '../types/deal.types';
import type { DealStatusConfig } from '../types/deal.types';

// ─── Status config ───────────────────────────────────────────────────────────

const STATUS_CONFIGS: Record<DealStatus, DealStatusConfig> = {
  OPEN: {
    label:   'Open',
    variant: 'info',
    bg:      'bg-blue-50',
    text:    'text-blue-700',
    accent:  'bg-blue-500',
  },
  WON: {
    label:   'Won',
    variant: 'success',
    bg:      'bg-emerald-50',
    text:    'text-emerald-700',
    accent:  'bg-emerald-500',
  },
  LOST: {
    label:   'Lost',
    variant: 'danger',
    bg:      'bg-rose-50',
    text:    'text-rose-700',
    accent:  'bg-rose-500',
  },
  ON_HOLD: {
    label:   'On Hold',
    variant: 'warning',
    bg:      'bg-amber-50',
    text:    'text-amber-700',
    accent:  'bg-amber-500',
  },
};

/**
 * Get the UI configuration for a deal status.
 * Falls back gracefully for unknown statuses.
 */
export function getDealStatusConfig(status: DealStatus): DealStatusConfig {
  return STATUS_CONFIGS[status] ?? {
    label:   status,
    variant: 'ghost',
    bg:      'bg-slate-50',
    text:    'text-slate-700',
    accent:  'bg-slate-400',
  };
}

// ─── Monetary formatting ─────────────────────────────────────────────────────

/**
 * Format a deal value for display.
 * Uses Intl.NumberFormat for locale-aware currency formatting.
 */
export function formatDealValue(
  value: number,
  currency = 'USD',
  options?: { compact?: boolean },
): string {
  if (options?.compact && value >= 1_000) {
    const formatter = new Intl.NumberFormat('en-US', {
      style:    'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1,
    });
    return formatter.format(value);
  }

  return new Intl.NumberFormat('en-US', {
    style:    'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

// ─── Business rule helpers ───────────────────────────────────────────────────

/**
 * A deal is terminal if it is in WON or LOST state.
 * Terminal deals cannot be moved to another stage.
 */
export function isDealTerminal(deal: Pick<Deal, 'status'>): boolean {
  return deal.status === 'WON' || deal.status === 'LOST';
}

/**
 * A deal is blockchain-eligible if it is WON.
 * Mirrors the backend DealEntity.isBlockchainEligible() logic.
 */
export function isDealBlockchainEligible(deal: Pick<Deal, 'status'>): boolean {
  return deal.status === 'WON';
}

/**
 * Get the display name for a deal's owner.
 */
export function getDealOwnerName(deal: Deal): string {
  if (!deal.owner) return 'Unassigned';
  return `${deal.owner.firstName} ${deal.owner.lastName}`.trim();
}

/**
 * Get the display name for a deal's contact.
 */
export function getDealContactName(deal: Deal): string | null {
  if (!deal.contact) return null;
  return `${deal.contact.firstName} ${deal.contact.lastName}`.trim();
}

/**
 * Compute the total value of all deals in a Kanban board.
 */
export function computeKanbanTotalValue(board: KanbanBoard): number {
  return board.stages.reduce((sum, col) => sum + col.totalValue, 0);
}

/**
 * Get the total count of open deals across all stages.
 */
export function computeKanbanDealCount(board: KanbanBoard): number {
  return board.stages.reduce((sum, col) => sum + col.count, 0);
}

/**
 * Move a deal card between stages in Kanban data (for optimistic updates).
 * Returns a new KanbanBoard object — pure, no mutation.
 */
export function moveKanbanCard(
  board: KanbanBoard,
  dealId: string,
  targetStageId: string,
): KanbanBoard {
  // Find the deal across all stages
  let movingDeal: Deal | undefined;
  const updatedStages = board.stages.map((col) => {
    const deal = col.deals.find((d) => d.id === dealId);
    if (deal) {
      movingDeal = { ...deal, stageId: targetStageId };
      return {
        ...col,
        deals:      col.deals.filter((d) => d.id !== dealId),
        count:      col.count - 1,
        totalValue: col.totalValue - deal.value,
      };
    }
    return col;
  });

  if (!movingDeal) return board;

  return {
    ...board,
    stages: updatedStages.map((col) => {
      if (col.stage.id !== targetStageId) return col;
      return {
        ...col,
        deals:      [...col.deals, movingDeal!],
        count:      col.count + 1,
        totalValue: col.totalValue + movingDeal!.value,
      };
    }),
  };
}
