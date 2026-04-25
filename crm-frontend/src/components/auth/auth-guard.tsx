'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/auth.store';

function LoadingScreen() {
  return (
    <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
    </div>
  );
}

/**
 * AuthGuard — hydration boundary for the dashboard layout.
 *
 * Why the `mounted` gate?
 * Zustand `persist` reads localStorage synchronously during store creation,
 * so `isLoading` flips to false before the first client render. But the server
 * always renders with `isLoading: true` (no localStorage on the server). Without
 * the `mounted` guard, the client would hydrate with different markup than the
 * server sent, triggering a React hydration mismatch error.
 *
 * Solution: render children unconditionally on the first pass (matching server
 * HTML), then after mount apply the real loading/auth checks. The window between
 * mount and the useEffect tick is ~1 frame — imperceptible to users.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const isLoading = useAuthStore((s) => s.isLoading);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    setMounted(true);
  }, []);

  // First render: match server HTML to avoid hydration mismatch.
  if (!mounted) return <>{children}</>;

  // After mount: block if localStorage hydration is still in progress.
  if (isLoading) return <LoadingScreen />;

  // After hydration: block if user is somehow absent (expired cookie edge case).
  // Middleware normally prevents reaching here without a valid session, but this
  // is a last-resort guard so nothing downstream assumes user is non-null.
  if (!user) return <LoadingScreen />;

  return <>{children}</>;
}
