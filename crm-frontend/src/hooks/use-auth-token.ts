/**
 * useAuthToken
 *
 * Single source of truth for consuming the auth token in client components.
 *
 * Why this exists:
 *   - After a page reload, the access token lives only in memory (Zustand). The
 *     token is re-acquired via a silent /auth/refresh call inside AuthRehydrator.
 *   - React Query hooks fire immediately on mount — before the refresh completes.
 *   - Without a guard, those queries race the refresh and send unauthenticated
 *     requests, causing API calls to return null/empty data.
 *
 * Usage:
 *   const { token, isReady } = useAuthToken();
 *   const { data } = useQuery({ queryKey: [...], queryFn: fn, enabled: isReady });
 *
 * isReady is `true` when:
 *   - Zustand has finished hydrating from localStorage, AND
 *   - Either a token is already in memory, OR
 *   - The user is not authenticated (no refresh needed)
 *
 * isReady is `false` only during the brief window when isAuthenticated=true but
 * accessToken=null AND a silent refresh is in-flight (isRehydrating=true).
 */

import { useAuthStore } from '@/store/auth.store';

export interface UseAuthTokenResult {
  /** The current Bearer token, or null if not authenticated. */
  token: string | null;
  /**
   * Safe to fire authenticated React Query requests when true.
   * False only while a silent token refresh is in-flight after a page reload.
   */
  isReady: boolean;
  /** Whether the user is authenticated (persisted in localStorage). */
  isAuthenticated: boolean;
}

export function useAuthToken(): UseAuthTokenResult {
  const token = useAuthStore((s) => s.accessToken);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const _hasHydrated = useAuthStore((s) => s._hasHydrated);
  const isRehydrating = useAuthStore((s) => s.isRehydrating);

  // Not ready if Zustand hasn't hydrated yet (SSR / first paint)
  if (!_hasHydrated) {
    return { token: null, isReady: false, isAuthenticated: false };
  }

  // Not ready if we know we're authenticated but are waiting for the refresh
  if (isAuthenticated && !token && isRehydrating) {
    return { token: null, isReady: false, isAuthenticated };
  }

  // All other cases are ready — token may be null for unauthenticated users,
  // but at least we're not in a mid-refresh limbo state.
  return { token, isReady: true, isAuthenticated };
}
