import { apiGet } from './client';
import type {
  DashboardMetrics,
  RevenueDataPoint,
  LeadSourceData,
  PipelineFunnelStage,
  SalesRepPerformance,
} from '@/types';

// ── Backend response shape ────────────────────────────────────────────────────
// The backend returns a nested object (see analytics.service.ts getDashboardMetrics).
// We map it here to the flat DashboardMetrics type used by the rest of the app
// so nothing outside this file needs to know about the backend's internal shape.

interface BackendDashboardResponse {
  leads: {
    total: number;
    thisMonth: number;
    lastMonth: number;
    deltaPercent: number;
  };
  contacts: { total: number };
  deals: {
    open: number;
    openPipelineValue: number;
    wonThisMonth: number;
    revenueThisMonth: number;
  };
  conversion: {
    rate: number;
    convertedLeads: number;
  };
  activities: { thisMonth: number };
  tickets: { open: number };
}

function mapDashboardResponse(raw: BackendDashboardResponse): DashboardMetrics {
  return {
    totalLeads:         raw.leads.total,
    newLeadsThisMonth:  raw.leads.thisMonth,
    leadsGrowth:        raw.leads.deltaPercent,
    totalContacts:      raw.contacts.total,
    openDeals:          raw.deals.open,
    totalDealValue:     raw.deals.openPipelineValue,
    wonDealsThisMonth:  raw.deals.wonThisMonth,
    wonDealValue:       raw.deals.revenueThisMonth,
    conversionRate:     raw.conversion.rate,
    openTickets:        raw.tickets.open,
    // avgDealSize: derived — avoids a division-by-zero edge case
    avgDealSize:
      raw.deals.wonThisMonth > 0
        ? Math.round(raw.deals.revenueThisMonth / raw.deals.wonThisMonth)
        : 0,
    revenueThisMonth:   raw.deals.revenueThisMonth,
    revenueGrowth:      0, // not provided by backend — placeholder
  };
}

// ── API ───────────────────────────────────────────────────────────────────────

export const analyticsApi = {
  getDashboard: async (): Promise<DashboardMetrics> => {
    const raw = await apiGet<BackendDashboardResponse>('/analytics/dashboard');
    return mapDashboardResponse(raw);
  },

  getRevenue: (params?: { period?: string; year?: number }) =>
    apiGet<RevenueDataPoint[]>('/analytics/revenue', params),

  getLeadSources: () => apiGet<LeadSourceData[]>('/analytics/lead-sources'),

  getSalesPerformance: (params?: { period?: string }) =>
    apiGet<SalesRepPerformance[]>('/analytics/sales-performance', params),

  getPipelineFunnel: (pipelineId?: string) =>
    apiGet<PipelineFunnelStage[]>('/analytics/pipeline-funnel', {
      pipelineId,
    }),
};
