/**
 * Server-side analytics API functions — SSR Migration Path
 *
 * These functions are called exclusively from React Server Components.
 * They use `cachedServerFetch` which forwards browser cookies to the backend,
 * enabling authenticated server-side rendering.
 *
 * CURRENT STATUS: Not used in production yet.
 *
 * WHY: The current auth flow stores the access token in Zustand (in-memory only).
 * Server Components run on Node.js and cannot access Zustand or localStorage.
 * The server-client forwards all cookies, but unless the backend sets the
 * access token as an httpOnly cookie, these requests will be unauthenticated.
 *
 * HOW TO MIGRATE (when backend is ready):
 *   1. Backend: on login, set `accessToken` as `httpOnly; Secure; SameSite=Strict` cookie
 *   2. Server Components can then call `getDashboardMetrics()` and get authed data
 *   3. Pass initial data as React Query `initialData` to avoid client-side waterfall
 *   4. Keep Zustand for UI state (user profile, theme) — not auth
 *
 * Revalidation tags allow targeted cache invalidation:
 *   revalidateTag('analytics') → clears all analytics cache entries
 */


import { cachedServerFetch } from '@/lib/api/server-client';
import type {
  DashboardMetrics,
  RevenueDataPoint,
  LeadSourceData,
  PipelineFunnelStage,
  SalesRepPerformance,
} from '@/types';

export async function getDashboardMetrics(): Promise<DashboardMetrics | null> {
  return cachedServerFetch<DashboardMetrics>('/analytics/dashboard', {
    revalidate: 30,
    tags: ['analytics', 'analytics:dashboard'],
  });
}

export async function getRevenueData(
  period?: string,
  year?: number,
): Promise<RevenueDataPoint[] | null> {
  const params = new URLSearchParams();
  if (period) params.set('period', period);
  if (year)   params.set('year', String(year));
  const qs = params.toString() ? `?${params.toString()}` : '';

  return cachedServerFetch<RevenueDataPoint[]>(`/analytics/revenue${qs}`, {
    revalidate: 30,
    tags: ['analytics', 'analytics:revenue'],
  });
}

export async function getLeadSources(): Promise<LeadSourceData[] | null> {
  return cachedServerFetch<LeadSourceData[]>('/analytics/lead-sources', {
    revalidate: 60,
    tags: ['analytics', 'analytics:lead-sources'],
  });
}

export async function getSalesPerformance(
  period?: string,
): Promise<SalesRepPerformance[] | null> {
  const qs = period ? `?period=${period}` : '';
  return cachedServerFetch<SalesRepPerformance[]>(`/analytics/sales-performance${qs}`, {
    revalidate: 60,
    tags: ['analytics', 'analytics:sales-performance'],
  });
}

export async function getPipelineFunnel(
  pipelineId?: string,
): Promise<PipelineFunnelStage[] | null> {
  const qs = pipelineId ? `?pipelineId=${pipelineId}` : '';
  return cachedServerFetch<PipelineFunnelStage[]>(`/analytics/pipeline-funnel${qs}`, {
    revalidate: 30,
    tags: ['analytics', 'analytics:pipeline-funnel'],
  });
}
