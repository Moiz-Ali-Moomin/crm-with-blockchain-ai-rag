/**
 * useAuthToken
 *
 * Kept for backward-compatibility with React Query hooks that gate fetches on
 * `isReady`. With cookie-based auth the access token is an httpOnly cookie, so
 * there is no client-side token value to return. `isReady` is true whenever the
 * user is considered authenticated (middleware already guaranteed this).
 */

import { useAuthStore } from '@/store/auth.store';

export interface UseAuthTokenResult {
  /** Always null — token lives in an httpOnly cookie, not JS state. */
  token: null;
  /** True when the user is authenticated. Safe to fire React Query requests. */
  isReady: boolean;
  isAuthenticated: boolean;
}

export function useAuthToken(): UseAuthTokenResult {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return { token: null, isReady: isAuthenticated, isAuthenticated };
}
