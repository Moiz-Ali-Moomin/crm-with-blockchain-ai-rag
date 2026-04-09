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
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
  '/dashboard':        'Dashboard',
  '/leads':            'Leads',
  '/contacts':         'Contacts',
  '/companies':        'Companies',
  '/deals':            'Deals',
  '/pipeline':         'Pipeline',
  '/tickets':          'Tickets',
  '/activities':       'Activities',
  '/tasks':            'Tasks',
  '/communications':   'Communications',
  '/automation':       'Workflows',
  '/analytics':        'Analytics',
  '/notifications':    'Notifications',
  '/settings':         'Settings',
  '/settings/team':    'Team',
  '/ai':               'AI Copilot',
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
    <header className="glass-navbar h-16 flex items-center justify-between px-5 shrink-0 sticky top-0 z-30">
      {/* Left: hamburger + breadcrumb */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuToggle}
          className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center',
            'text-white/50 hover:text-white hover:bg-white/8',
            'transition-all duration-150',
          )}
          aria-label="Toggle sidebar"
        >
          <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
            <rect y="0"  width="16" height="1.5" rx="0.75" fill="currentColor" />
            <rect y="5"  width="11" height="1.5" rx="0.75" fill="currentColor" />
            <rect y="10" width="7"  height="1.5" rx="0.75" fill="currentColor" />
          </svg>
        </button>

        <div className="h-4 w-px bg-white/10" />

        <h1 className="text-sm font-semibold text-white/80 tracking-tight">
          {pageTitle}
        </h1>
      </div>

      {/* Right: search + new + bell + user */}
      <div className="flex items-center gap-1.5">
        {/* Search bar */}
        <button
          className={cn(
            'hidden md:flex items-center gap-2 px-3 h-8 rounded-lg w-56',
            'bg-gray-800/80 border border-gray-700/60 hover:border-gray-600',
            'text-gray-500 hover:text-gray-400',
            'transition-all duration-150',
          )}
        >
          <Search size={13} className="shrink-0" />
          <span className="flex-1 text-left text-xs truncate">Search or ask AI…</span>
          <div className="flex items-center gap-0.5 shrink-0 opacity-50">
            <Command size={10} />
            <span className="text-[11px]">K</span>
          </div>
        </button>

        {/* Add New */}
        <button
          className={cn(
            'hidden sm:flex items-center gap-1.5 px-3 h-8 rounded-lg',
            'bg-blue-600 hover:bg-blue-500 text-white',
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
              'text-white/50 hover:text-white hover:bg-white/8',
              'transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20',
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
                  className={cn(
                    'absolute -top-0.5 -right-0.5',
                    'min-w-[16px] h-4 px-0.5',
                    'bg-blue-600',
                    'text-white text-[9px] font-bold rounded-full',
                    'flex items-center justify-center',
                  )}
                >
                  {unreadCount > 99 ? '99+' : unreadCount}
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>

        {/* Separator */}
        <div className="h-4 w-px bg-white/10 mx-1" />

        {/* User dropdown */}
        <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                'flex items-center gap-2 rounded-xl border border-transparent pl-1.5 pr-2.5 py-1',
                'text-left transition-all duration-150 group',
                'hover:border-white/10 hover:bg-white/6',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-0',
                'data-[state=open]:border-white/12 data-[state=open]:bg-white/8',
              )}
              aria-label="Open user menu"
            >
              <div className="relative">
                <Avatar className="h-8 w-8 ring-1 ring-white/10">
                  <AvatarFallback className="bg-blue-600 text-[11px] font-bold text-white">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-slate-950 bg-emerald-400" />
              </div>
              <div className="hidden min-w-0 sm:block">
                <p className="truncate text-[13px] font-medium text-white/78 transition-colors group-hover:text-white">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="truncate text-[11px] text-slate-400">
                  {user?.role ? parseEnumLabel(user.role) : 'User'}
                </p>
              </div>
              <ChevronDown
                size={12}
                strokeWidth={2.5}
                className={cn(
                  'text-white/35 transition-transform duration-200',
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
            className="z-[90]"
          >
            <div className="rounded-[18px] bg-white/[0.03] p-1">
              <DropdownMenuLabel className="px-3 pb-3 pt-2 normal-case tracking-normal text-inherit">
                <div className="flex items-start gap-3">
                  <Avatar className="mt-0.5 h-10 w-10 ring-1 ring-white/10">
                    <AvatarFallback className="bg-blue-600 text-xs font-semibold text-white">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="truncate text-sm font-semibold text-white">
                      {user?.firstName} {user?.lastName}
                    </p>
                    <p className="truncate text-xs text-slate-400">{user?.email}</p>
                    <span className="inline-flex items-center rounded-full border border-violet-400/15 bg-violet-500/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-200/90">
                      {user?.role ? parseEnumLabel(user.role) : 'User'}
                    </span>
                  </div>
                </div>
              </DropdownMenuLabel>

              <DropdownMenuSeparator />

              <DropdownMenuGroup>
                <DropdownMenuItem onSelect={() => router.push('/settings')}>
                  <User size={15} strokeWidth={1.9} className="text-slate-400" />
                  <span className="flex-1">Profile</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => router.push('/settings')}>
                  <Settings size={15} strokeWidth={1.9} className="text-slate-400" />
                  <span className="flex-1">Settings</span>
                </DropdownMenuItem>
              </DropdownMenuGroup>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onSelect={handleLogout}
                className="text-rose-300 hover:bg-rose-500/10 hover:text-rose-200 focus:bg-rose-500/12 focus:text-rose-100"
              >
                <LogOut size={15} strokeWidth={1.9} className="text-rose-300/90" />
                <span className="flex-1">Sign out</span>
              </DropdownMenuItem>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
