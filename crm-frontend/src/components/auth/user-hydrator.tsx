'use client';

import { useRef } from 'react';
import { useAuthStore, type User } from '@/store/auth.store';

/**
 * Hydrates the Zustand auth store with user data fetched server-side.
 *
 * Critically, this runs SYNCHRONOUSLY during React's render pass — not in a
 * useEffect — so by the time sibling components like DashboardLayout, Navbar,
 * and Sidebar render, the store already contains the user. This prevents the
 * one-render gap that causes "Cannot read properties of undefined" crashes on
 * hard refresh when localStorage is cold.
 *
 * The useRef guard ensures setAuth is called at most once per user identity,
 * making this safe under React Strict Mode's double-invocation.
 */
export function UserHydrator({ user }: { user: User }) {
  const lastId = useRef<string | null>(null);

  if (lastId.current !== user.id) {
    lastId.current = user.id;
    // Direct store mutation during render is safe for external (non-React)
    // stores. Zustand's internal state updates immediately; subscriber
    // components scheduled to render after this one will see the new value.
    useAuthStore.getState().setAuth(user);
  }

  return null;
}
