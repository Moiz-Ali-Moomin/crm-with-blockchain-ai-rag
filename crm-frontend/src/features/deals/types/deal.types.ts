/**
 * Deal Feature — Domain Types
 *
 * Feature-local type definitions that extend / narrow the global @/types.
 * Components and hooks inside this feature import from here, not from the
 * global barrel, so the feature stays self-contained and independently refactorable.
 */

import type { Deal, DealStatus, DealFilters, KanbanBoard, KanbanColumn, Stage } from '@/types';

// Re-export so feature internals never reach outside their boundary
export type { Deal, DealStatus, DealFilters, KanbanBoard, KanbanColumn, Stage };

// ─── UI-only derived types ──────────────────────────────────────────────────

export type DealView = 'list' | 'kanban';

export type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'ghost';

export interface DealStatusConfig {
  label: string;
  variant: BadgeVariant;
  /** Tailwind class for background colour */
  bg: string;
  /** Tailwind class for text colour */
  text: string;
  /** Tailwind class for border/dot colour */
  accent: string;
}

// ─── Form DTOs (matches backend CreateDealDto / UpdateDealDto) ──────────────

export interface CreateDealDto {
  title: string;
  value: number;
  currency?: string;
  pipelineId: string;
  stageId: string;
  contactId?: string;
  companyId?: string;
  closingDate?: string;
  description?: string;
  tags?: string[];
}

export interface UpdateDealDto extends Partial<CreateDealDto> {}

export interface MoveDealStageDto {
  stageId: string;
  lostReason?: string;
}

// ─── Page state ─────────────────────────────────────────────────────────────

export interface DealsFilters {
  search: string;
  page: number;
  limit: number;
  status?: DealStatus;
  pipelineId?: string;
  stageId?: string;
  ownerId?: string;
}

export const DEFAULT_DEALS_FILTERS: DealsFilters = {
  search: '',
  page: 1,
  limit: 20,
};
