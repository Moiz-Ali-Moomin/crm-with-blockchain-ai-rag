import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type UserRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'SALES_MANAGER'
  | 'SALES_REP'
  | 'SUPPORT_AGENT'
  | 'VIEWER';

export interface User {
  id: string;
  tenantId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: string;
  jobTitle?: string;
  phone?: string;
  avatar?: string;
  timezone: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  /**
   * True while the Zustand persist middleware is reading from localStorage.
   * Starts true on every render (server or client) and flips to false once
   * storage is hydrated. Components should gate rendering on !isLoading.
   */
  isLoading: boolean;
  /** True once Zustand has rehydrated persisted state from localStorage. */
  _hasHydrated: boolean;
  /** Set the current user (called after login or from the server-side initial data). */
  setAuth: (user: User) => void;
  logout: () => void;
  _setHasHydrated: (value: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      _hasHydrated: false,

      setAuth: (user) => set({ user, isAuthenticated: true, isLoading: false }),

      logout: () => set({ user: null, isAuthenticated: false }),

      _setHasHydrated: (value) => set({ _hasHydrated: value, isLoading: !value }),
    }),
    {
      name: 'crm-auth',
      storage: createJSONStorage(() =>
        typeof window !== 'undefined'
          ? localStorage
          : { getItem: () => null, setItem: () => {}, removeItem: () => {} }
      ),
      // Persist user profile for instant rendering; auth truth lives in the httpOnly cookie.
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
      onRehydrateStorage: () => (state) => {
        state?._setHasHydrated(true);
      },
    }
  )
);
