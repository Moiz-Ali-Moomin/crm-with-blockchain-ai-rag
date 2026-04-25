'use client';

/**
 * Application Providers
 *
 * Wraps the app with:
 *   1. ErrorBoundary — catches root-level rendering errors
 *   2. ThemeApplicator — syncs theme state with document class
 *   3. SocketProvider — single WebSocket connection shared by all components
 *   4. QueryClientProvider — TanStack Query with per-entity stale times
 *   5. Toaster — sonner notification system
 *
 * Auth rehydration is no longer needed here. The access token lives in an
 * httpOnly cookie managed by NestJS. Next.js middleware gates protected routes
 * before the page is served, and the dashboard layout fetches the current user
 * server-side to hydrate the Zustand store on first render.
 *
 * Stale time strategy (prevents over-fetching):
 *   - Notifications: 10s (near real-time)
 *   - Deals, Leads, Contacts: 60s (relatively stable)
 *   - Analytics: 5min (expensive, infrequent changes)
 *   - Pipelines, Users: 10min (rarely change)
 */

import { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Toaster } from 'sonner';
import { ErrorBoundary } from '@/components/error-boundary';
import { SocketProvider } from '@/hooks/use-socket-singleton';
import { observe } from '@/lib/observability';
import { useThemeStore } from '@/store/theme.store';

function ThemeApplicator() {
  const theme = useThemeStore((s) => s.theme);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);
  return null;
}

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime:            60_000,
        retry:                1,
        refetchOnWindowFocus: false,
        refetchOnReconnect:   true,
      },
      mutations: {
        onError: (error) => {
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
      <ThemeApplicator />
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
