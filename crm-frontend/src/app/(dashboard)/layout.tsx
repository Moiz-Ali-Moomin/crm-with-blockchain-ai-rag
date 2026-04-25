import { AuthGuard } from '@/components/auth/auth-guard';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { UserHydrator } from '@/components/auth/user-hydrator';
import { cachedServerFetch } from '@/lib/api/server-client';
import type { User } from '@/store/auth.store';

/**
 * Fetch the authenticated user from NestJS using the access_token cookie that
 * the browser forwards to Next.js on every page request. This gives us the
 * current user before the page is sent to the client — no loading flash, no
 * client-side auth state dependency for the initial render.
 *
 * If the cookie is missing or expired the middleware has already redirected to
 * /login, so a null result here means an expired token; the 401 refresh flow
 * in the axios client will handle it on the first API call.
 */
async function getServerUser(): Promise<User | null> {
  return cachedServerFetch<User>('/auth/me', { revalidate: false });
}

export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await getServerUser();

  return (
    <AuthGuard>
      {/* Hydrate the Zustand auth store with the server-fetched user so
          client components (settings, socket, etc.) have instant access. */}
      {user && <UserHydrator user={user} />}
      <DashboardLayout>{children}</DashboardLayout>
    </AuthGuard>
  );
}
