'use client';

/**
 * AuthGuard — thin wrapper kept for layout composition.
 *
 * Route protection is now handled by src/middleware.ts (Edge runtime), so this
 * component no longer needs to redirect or do silent token refreshes. It simply
 * renders children once React has mounted; the server has already verified the
 * cookie before the page was served.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
