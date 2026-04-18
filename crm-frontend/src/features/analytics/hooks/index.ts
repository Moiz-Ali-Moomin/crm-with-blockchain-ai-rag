// trigger cicd 

import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '@/lib/api/analytics.api';
import { queryKeys } from '@/lib/query/query-keys';

export function useDashboardMetrics() {
  return useQuery({
    queryKey: queryKeys.analytics.dashboard,
    queryFn: analyticsApi.getDashboard,
    staleTime: 2 * 60 * 1000,
  });
}

export function useRevenueData(params?: { period?: string; year?: number }) {
  return useQuery({
    queryKey: [...queryKeys.analytics.revenue, params],
    queryFn: () => analyticsApi.getRevenue(params),
    staleTime: 5 * 60 * 1000,
  });
}

export function useLeadSources() {
  return useQuery({
    queryKey: queryKeys.analytics.leadSources,
    queryFn: analyticsApi.getLeadSources,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSalesPerformance(params?: { period?: string }) {
  return useQuery({
    queryKey: [...queryKeys.analytics.salesPerformance, params],
    queryFn: () => analyticsApi.getSalesPerformance(params),
    staleTime: 5 * 60 * 1000,
  });
}

export function usePipelineFunnel(pipelineId?: string) {
  return useQuery({
    queryKey: [...queryKeys.analytics.pipelineFunnel, pipelineId],
    queryFn: () => analyticsApi.getPipelineFunnel(pipelineId),
    staleTime: 5 * 60 * 1000,
  });
}
