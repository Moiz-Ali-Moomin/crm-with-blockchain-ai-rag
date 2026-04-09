'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell, ChevronDown, Settings, LogOut, User,
  Search, Command, Plus,
} from 'lucide-react';
import { useState } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { notificationsApi } from '@/lib/api/notifications.api';
import { authApi } from '@/lib/api/auth.api';
import { queryKeys } from '@/lib/query/query-keys';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn, parseEnumLabel } from '@/lib/utils';

interface NavbarProps {
  onMenuToggle: () => void;
}

const breadcrumbMap: Record<string, string> = {
  '/dashboard':       'Dashboard',
  '/leads':           'Leads',
  '/contacts':        'Contacts',
  '/companies':       'Companies',
  '/deals':           'Deals',
  '/pipeline':        'Pipeline',
  '/tickets':         'Tickets',
  '/activities':      'Activities',
  '/tasks':           'Tasks',
  '/communications':  'Communications',
  '/automation':      'Workflows',
  '/analytics':       'Analytics',
  '/notifications':   'Notifications',
  '/settings':        'Settings',
  '/settings/team':   'Team',
  '/ai':              'AI Copilot',
};

function resolvePageTitle(pathname: string): string {
  for (const [key, title] of Object.entries(breadcrumbMap)) {
    if (pathname === key || (key !== '/dashboard' && pathname.startsWith(key + '/'))) {
      return title;
    }
  }
  return 'CRM Platform';
}

export function Navbar({ onMenuToggle }: NavbarProps) {
  const router   = useRouter();
  const pathname = usePathname();
  const user     = useAuthStore((s) => s.user);
  const logout   = useAuthStore((s) => s.logout);

  const [dropdownOpen, setDropdownOpen] = useState(false);

  const { data: unreadData } = useQuery({
    queryKey: queryKeys.notifications.unreadCount(user?.id ?? ''),
    queryFn:  notificationsApi.getUnreadCount,
    refetchInterval: 30_000,
    enabled: !!user?.id,
  });

  const unreadCount = unreadData?.count ?? 0;
  const pageTitle   = resolvePageTitle(pathname);
  const initials    = user
    ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
    : 'U';

  const handleLogout = async () => {
    setDropdownOpen(false);
    try { await authApi.logout(); } catch { /* ignored */ } finally {
      logout();
      router.replace('/login');
    }
  };

  return (
    <header className="bg-white border-b border-gray-200 h-14 flex items-center justify-between px-5 shrink-0 sticky top-0 z-30">
      {/* Left: hamburger + page title */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuToggle}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all duration-150"
          aria-label="Toggle sidebar"
        >
          <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
            <rect y="0"  width="16" height="1.5" rx="0.75" fill="currentColor" />
            <rect y="5"  width="11" height="1.5" rx="0.75" fill="currentColor" />
            <rect y="10" width="7"  height="1.5" rx="0.75" fill="currentColor" />
          </svg>
        </button>

        <div className="h-4 w-px bg-gray-200" />

        <h1 className="text-sm font-semibold text-gray-800 tracking-tight">
          {pageTitle}
        </h1>
      </div>

      {/* Right: search + new + bell + user */}
      <div className="flex items-center gap-1.5">
        {/* Search bar */}
        <button
          className={cn(
            'hidden md:flex items-center gap-2 px-3 h-8 rounded-lg w-56',
            'bg-gray-100 border border-gray-200 hover:border-gray-300',
            'text-gray-400 hover:text-gray-500',
            'transition-all duration-150',
          )}
        >
          <Search size={13} className="shrink-0" />
          <span className="flex-1 text-left text-xs truncate">Search or ask AI…</span>
          <div className="flex items-center gap-0.5 shrink-0 opacity-60">
            <Command size={10} />
            <span className="text-[11px]">K</span>
          </div>
        </button>

        {/* Add New */}
        <button
          className={cn(
            'hidden sm:flex items-center gap-1.5 px-3 h-8 rounded-lg',
            'bg-blue-600 hover:bg-blue-700 text-white',
            'text-xs font-semibold',
            'transition-colors duration-150',
          )}
        >
          <Plus size={14} strokeWidth={2.5} />
          <span>New</span>
        </button>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => router.push('/notifications')}
            className={cn(
              'relative w-8 h-8 rounded-lg flex items-center justify-center',
              'text-gray-400 hover:text-gray-700 hover:bg-gray-100',
              'transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30',
            )}
          >
            <Bell size={16} strokeWidth={1.8} />
            <AnimatePresence>
              {unreadCount > 0 && (
                <motion.span
                  key="badge"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 bg-blue-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center"
                >
                  {unreadCount > 99 ? '99+' : unreadCount}
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>

        {/* Separator */}
        <div className="h-4 w-px bg-gray-200 mx-1" />

        {/* User dropdown */}
        <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                'flex items-center gap-2 rounded-lg border border-transparent pl-1.5 pr-2.5 py-1',
                'text-left transition-all duration-150',
                'hover:border-gray-200 hover:bg-gray-100',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30',
                'data-[state=open]:border-gray-200 data-[state=open]:bg-gray-100',
              )}
              aria-label="Open user menu"
            >
              {/* Avatar */}
              <div className="relative">
                <div className="h-7 w-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-[11px] font-bold ring-1 ring-gray-200">
                  {initials}
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-400" />
              </div>

              <div className="hidden min-w-0 sm:block">
                <p className="truncate text-[13px] font-medium text-gray-700">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="truncate text-[11px] text-gray-400">
                  {user?.role ? parseEnumLabel(user.role) : 'User'}
                </p>
              </div>

              <ChevronDown
                size={12}
                strokeWidth={2.5}
                className={cn(
                  'text-gray-400 transition-transform duration-200',
                  dropdownOpen && 'rotate-180',
                )}
              />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="end"
            side="bottom"
            sideOffset={10}
            collisionPadding={12}
            className="z-[90] w-56 bg-white border border-gray-200 shadow-lg rounded-xl p-1"
          >
            <DropdownMenuLabel className="px-3 pb-3 pt-2 normal-case tracking-normal text-inherit">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 h-9 w-9 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-semibold shrink-0">
                  {initials}
                </div>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="truncate text-sm font-semibold text-gray-900">
                    {user?.firstName} {user?.lastName}
                  </p>
                  <p className="truncate text-xs text-gray-500">{user?.email}</p>
                  <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-600">
                    {user?.role ? parseEnumLabel(user.role) : 'User'}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>

            <DropdownMenuSeparator className="bg-gray-100" />

            <DropdownMenuGroup>
              <DropdownMenuItem
                onSelect={() => router.push('/settings')}
                className="text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                <User size={15} strokeWidth={1.9} className="text-gray-400" />
                <span className="flex-1">Profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => router.push('/settings')}
                className="text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                <Settings size={15} strokeWidth={1.9} className="text-gray-400" />
                <span className="flex-1">Settings</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>

            <DropdownMenuSeparator className="bg-gray-100" />

            <DropdownMenuItem
              onSelect={handleLogout}
              className="text-rose-600 hover:bg-rose-50 focus:bg-rose-50 rounded-lg"
            >
              <LogOut size={15} strokeWidth={1.9} className="text-rose-400" />
              <span className="flex-1">Sign out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
