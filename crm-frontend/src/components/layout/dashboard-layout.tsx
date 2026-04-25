'use client';

import { useState } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { Sidebar } from './sidebar';
import { Navbar } from './header';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

/**
 * DashboardLayout — the glass shell wrapping all authenticated pages.
 *
 * Structure:
 *   ┌─────────────┬────────────────────────────┐
 *   │             │  Navbar (glass-navbar)      │
 *   │  Sidebar    ├────────────────────────────┤
 *   │  (glass)    │  <main> — page content     │
 *   │             │                            │
 *   └─────────────┴────────────────────────────┘
 *
 * The gradient background is set on <body> in globals.css so it bleeds
 * through both the sidebar and content area uniformly.
 */
export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const user = useAuthStore((s) => s.user);

  // Last-resort guard: AuthGuard above should have already blocked rendering
  // without a user, but this prevents Sidebar/Navbar from crashing if user
  // is ever null here (e.g., during the mount tick before AuthGuard evaluates).
  if (!user) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
      <Sidebar open={sidebarOpen} onToggle={() => setSidebarOpen((o) => !o)} />

      <div className="relative flex flex-col flex-1 min-w-0 overflow-hidden">
        <Navbar onMenuToggle={() => setSidebarOpen((o) => !o)} />

        {/* Page content area */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          {/* Inner padding + max-width constraint */}
          <div className="px-6 py-6 max-w-[1600px] mx-auto w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

// Re-export Navbar as named export so existing `import { Header }` still resolves
// if any file imported it under that name — prevents breaking other pages.
export { Navbar as Header };
