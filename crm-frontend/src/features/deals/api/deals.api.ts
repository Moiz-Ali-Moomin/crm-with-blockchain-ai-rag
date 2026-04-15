/**
 * Deals Feature — API Client (Data Layer)
 *
 * Feature-local API surface. Re-exports from lib/api with strongly-typed
 * DTOs instead of raw `object` types. This is the only file in this feature
 * that knows about HTTP endpoints.
 *
 * Consumers inside this feature import from here — not from @/lib/api directly.
 */

import { apiGet, apiPost, apiPatch, apiDelete, apiGetPaginated } from '@/lib/api/client';
import type { Deal, KanbanBoard, PaginatedData } from '@/types';
import type { CreateDealDto, UpdateDealDto, MoveDealStageDto, DealsFilters } from '../types/deal.types';

export const dealsApi = {
  /** List deals with pagination and filters */
  getAll: (filters?: Partial<DealsFilters>) =>
    apiGetPaginated<Deal>('/deals', filters),

  /** Get a single deal with full relations */
  getById: (id: string) =>
    apiGet<Deal>(`/deals/${id}`),

  /** Get kanban board data for a pipeline */
  getKanban: (pipelineId: string) =>
    apiGet<KanbanBoard>(`/deals/kanban/${pipelineId}`),

  /** Get revenue forecast for a pipeline */
  getForecast: (pipelineId: string) =>
    apiGet<ForecastResult>(`/deals/forecast/${pipelineId}`),

  /** Create a new deal */
  create: (data: CreateDealDto) =>
    apiPost<Deal>('/deals', data),

  /** Update mutable fields on a deal */
  update: (id: string, data: UpdateDealDto) =>
    apiPatch<Deal>(`/deals/${id}`, data),

  /** Move a deal to a new stage (enforces state machine on backend) */
  moveStage: (id: string, dto: MoveDealStageDto) =>
    apiPatch<Deal>(`/deals/${id}/move-stage`, dto),

  /** Delete a deal — WON deals will be rejected by backend */
  delete: (id: string) =>
    apiDelete<{ deleted: true }>(`/deals/${id}`),
} as const;

// ─── Response types ─────────────────────────────────────────────────────────

export interface ForecastResult {
  totalPipeline: number;
  totalForecast: number;
  breakdown: Array<{
    stage:          string;
    probability:    number;
    totalValue:     number;
    forecastedValue: number;
    dealCount:      number;
  }>;
}
