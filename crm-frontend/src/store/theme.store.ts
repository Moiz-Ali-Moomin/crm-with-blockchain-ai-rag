import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ThemeState {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  setTheme: (theme: 'light' | 'dark') => void;
}

function getInitialTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  try {
    const stored = localStorage.getItem('crm-theme');
    if (stored) return JSON.parse(stored)?.state?.theme ?? 'light';
  } catch {}
  return 'light';
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: getInitialTheme(),
      toggleTheme: () =>
        set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),
      setTheme: (theme) => set({ theme }),
    }),
    { name: 'crm-theme' },
  ),
);
