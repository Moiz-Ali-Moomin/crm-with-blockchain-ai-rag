'use client';

import { useQuery } from '@tanstack/react-query';
import { Users, TrendingUp, DollarSign, Percent } from 'lucide-react';
import { analyticsApi } from '@/lib/api/analytics.api';
import { queryKeys } from '@/lib/query/query-keys';
import { StatCard } from '@/components/ui/stat-card';
import { formatCurrency } from '@/lib/utils';
import { useAuthToken } from '@/hooks/use-auth-token';

// ── Skeleton ──────────────────────────────────────────────────────────────────

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-[110px] bg-canvas border border-ui-border animate-pulse rounded-xl" />
      ))}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DashboardKpiCards() {
  // isReady is false while a silent token refresh is in-flight after page reload.
  // Keeping `enabled: isReady` prevents this query from racing the rehydration
  // and returning empty data that briefly renders as zeros.
  const { isReady } = useAuthToken();

  const { data: metrics, isLoading } = useQuery({
    queryKey: queryKeys.analytics.dashboard,
    queryFn: () => analyticsApi.getDashboard(),
    staleTime: 30_000,
    enabled: isReady,
  });

  // Show skeleton while waiting for token OR while the request is in-flight.
  if (!isReady || isLoading) return <KpiSkeleton />;

  // `revenueThisMonth` is the canonical field per DashboardMetrics in @/types.
  // No any-casting needed — TypeScript knows this field exists.
  const revenue = metrics?.revenueThisMonth ?? 0;

  const cards = [
    {
      title: 'Total Leads',
      value: metrics?.totalLeads ?? 0,
      displayValue: (metrics?.totalLeads ?? 0).toLocaleString(),
      icon: <Users size={14} />,
      gradient: 1 as const,
    },
    {
      title: 'Open Deals',
      value: metrics?.openDeals ?? 0,
      displayValue: (metrics?.openDeals ?? 0).toString(),
      icon: <TrendingUp size={14} />,
      gradient: 2 as const,
    },
    {
      title: 'Revenue (MTD)',
      value: revenue,
      displayValue: formatCurrency(revenue),
      icon: <DollarSign size={14} />,
      gradient: 3 as const,
    },
    {
      title: 'Conversion Rate',
      value: metrics?.conversionRate ?? 0,
      displayValue: `${metrics?.conversionRate ?? 0}%`,
      icon: <Percent size={14} />,
      gradient: 4 as const,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {cards.map((card, i) => (
        <StatCard key={i} {...card} />
      ))}
    </div>
  );
}
