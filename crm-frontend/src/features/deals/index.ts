/**
 * Deals Feature — Public API
 *
 * This is the only import path external modules should use.
 * Internal structure can be reorganized without touching consumers.
 *
 * Rule: Only export what other features genuinely need.
 *       Keep internals (transformers, schemas) private inside the feature.
 */

// ── Components ──────────────────────────────────────────────────────────────
export { DealModal }           from './components/deal-modal';
export { DealCard }            from './components/deal-card';
export { DealStatusBadge }     from './components/deal-status-badge';
export { buildDealColumns }    from './components/deal-table-columns';
export {
  DealTableSkeleton,
  DealKanbanSkeleton,
  DealDetailSkeleton,
  DealCardSkeleton,
} from './components/deal-skeleton';

// ── Hooks ───────────────────────────────────────────────────────────────────
export {
  useDeals,
  useDeal,
  useDealKanban,
  useDealForecast,
  useCreateDeal,
  useUpdateDeal,
  useMoveDealStage,
  useDeleteDeal,
} from './hooks';

// ── Types (public types only) ────────────────────────────────────────────────
export type {
  Deal,
  DealStatus,
  DealView,
  DealStatusConfig,
  CreateDealDto,
  UpdateDealDto,
  MoveDealStageDto,
  DealsFilters,
} from './types/deal.types';

// ── Domain helpers (useful across features) ──────────────────────────────────
export {
  getDealStatusConfig,
  formatDealValue,
  isDealTerminal,
  isDealBlockchainEligible,
} from './domain/deal.transformers';
