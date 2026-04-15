'use client';

/**
 * Application Providers
 *
 * Wraps the app with:
 *   1. ErrorBoundary — catches root-level rendering errors
 *   2. SocketProvider — single WebSocket connection shared by all components
 *   3. QueryClientProvider — TanStack Query with per-entity stale times
 *   4. Toaster — sonner notification system
 *
 * Stale time strategy (prevents over-fetching):
 *   - Notifications: 10s (near real-time)
 *   - Deals, Leads, Contacts: 60s (relatively stable)
 *   - Analytics: 5min (expensive, infrequent changes)
 *   - Pipelines, Users: 10min (rarely change)
 */

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Toaster } from 'sonner';
import { ErrorBoundary } from '@/components/error-boundary';
import { SocketProvider } from '@/hooks/use-socket-singleton';
import { observe } from '@/lib/observability';

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime:            60_000,   // Default: 60s
        retry:                1,
        refetchOnWindowFocus: false,
        refetchOnReconnect:   true,
      },
      mutations: {
        onError: (error) => {
          // Global mutation error capture — individual hooks still handle UI feedback
          observe.error(error as Error, { context: 'GlobalMutationError' });
        },
      },
    },
  });
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(makeQueryClient);

  return (
    <ErrorBoundary context="Application Root">
      <SocketProvider>
        <QueryClientProvider client={queryClient}>
          {children}
          <Toaster richColors position="top-right" closeButton />
          {process.env.NODE_ENV === 'development' && (
            <ReactQueryDevtools initialIsOpen={false} />
          )}
        </QueryClientProvider>
      </SocketProvider>
    </ErrorBoundary>
  );
}
