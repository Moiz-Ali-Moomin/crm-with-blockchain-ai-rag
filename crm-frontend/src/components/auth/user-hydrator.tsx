'use client';

import { useEffect } from 'react';
import { useAuthStore, type User } from '@/store/auth.store';

/**
 * Hydrates the Zustand auth store with user data fetched server-side.
 * This runs once on mount so client components have the user available
 * immediately without a separate client-side API call.
 */
export function UserHydrator({ user }: { user: User }) {
  useEffect(() => {
    useAuthStore.getState().setAuth(user);
  }, [user]);
  return null;
}
