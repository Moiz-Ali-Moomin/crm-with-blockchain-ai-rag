'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell, ChevronDown, Settings, LogOut, User,
  Search, Command, Plus, ChevronRight,
  Users, UserCircle, TrendingUp, Building2, Ticket,
  Sun, Moon,
} from 'lucide-react';
import { useThemeStore } from '@/store/theme.store';
import { useState, useRef, useEffect } from 'react';
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

const sectionMap: Record<string, string> = {
  '/leads':          'CRM',
  '/contacts':       'CRM',
  '/companies':      'CRM',
  '/deals':          'CRM',
  '/pipeline':       'CRM',
  '/tickets':        'Support',
  '/activities':     'Support',
  '/tasks':          'Support',
  '/communications': 'Support',
  '/automation':     'Automation',
  '/analytics':      'Automation',
  '/ai':             'Intelligence',
  '/settings':       'Settings',
  '/settings/team':  'Settings',
};

function resolvePageTitle(pathname: string): string {
  for (const [key, title] of Object.entries(breadcrumbMap)) {
    if (pathname === key || (key !== '/dashboard' && pathname.startsWith(key + '/'))) {
      return title;
    }
  }
  return 'CRM Platform';
}

function resolveSection(pathname: string): string | null {
  for (const [key, section] of Object.entries(sectionMap)) {
    if (pathname === key || pathname.startsWith(key + '/')) return section;
  }
  return null;
}

// ── Quick-create items ────────────────────────────────────────────────────────

const NEW_ITEMS = [
  { label: 'New Lead',    href: '/leads/new',    icon: Users,      color: 'text-blue-600 bg-blue-50' },
  { label: 'New Contact', href: '/contacts/new', icon: UserCircle, color: 'text-violet-600 bg-violet-50' },
  { label: 'New Deal',    href: '/deals/new',    icon: TrendingUp, color: 'text-emerald-600 bg-emerald-50' },
  { label: 'New Company', href: '/companies/new',icon: Building2,  color: 'text-amber-600 bg-amber-50' },
  { label: 'New Ticket',  href: '/tickets/new',  icon: Ticket,     color: 'text-rose-600 bg-rose-50' },
];

// ── New dropdown ──────────────────────────────────────────────────────────────

function NewDropdown() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative hidden sm:block">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-1.5 px-3 h-8 rounded-md',
          'bg-blue-600 hover:bg-blue-700 text-white',
          'text-xs font-semibold',
          'transition-colors duration-150',
        )}
      >
        <Plus size={13} strokeWidth={2.5} />
        <span>New</span>
        <ChevronDown size={11} strokeWidth={2.5} className={cn('ml-0.5 transition-transform duration-150', open && 'rotate-180')} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.15, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="absolute right-0 top-[calc(100%+6px)] w-48 bg-canvas border border-ui-border rounded-xl shadow-lg py-1 z-50"
          >
            {NEW_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.href}
                  onClick={() => { router.push(item.href); setOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium text-fg-secondary hover:bg-canvas-subtle transition-colors text-left"
                >
                  <div className={cn('w-6 h-6 rounded-md flex items-center justify-center shrink-0', item.color)}>
                    <Icon size={12} strokeWidth={2} />
                  </div>
                  {item.label}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main Navbar ───────────────────────────────────────────────────────────────

export function Navbar({ onMenuToggle }: NavbarProps) {
  const router   = useRouter();
  const pathname = usePathname();
  const user     = useAuthStore((s) => s.user);
  const logout   = useAuthStore((s) => s.logout);

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const { theme, toggleTheme } = useThemeStore();

  const { data: unreadData } = useQuery({
    queryKey: queryKeys.notifications.unreadCount(user?.id ?? ''),
    queryFn:  notificationsApi.getUnreadCount,
    refetchInterval: 30_000,
    enabled: !!user?.id,
  });

  const unreadCount = unreadData?.count ?? 0;
  const pageTitle   = resolvePageTitle(pathname);
  const section     = resolveSection(pathname);
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
    <header className="bg-canvas border-b border-ui-border h-14 flex items-center justify-between px-5 shrink-0 sticky top-0 z-30">
      {/* Left: hamburger + breadcrumb */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuToggle}
          className="w-8 h-8 rounded-md flex items-center justify-center text-fg-subtle hover:text-fg hover:bg-canvas-subtle transition-all duration-150"
          aria-label="Toggle sidebar"
        >
          <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
            <rect y="0"  width="16" height="1.5" rx="0.75" fill="currentColor" />
            <rect y="5"  width="11" height="1.5" rx="0.75" fill="currentColor" />
            <rect y="10" width="7"  height="1.5" rx="0.75" fill="currentColor" />
          </svg>
        </button>

        <div className="h-4 w-px bg-ui-border" />

        <nav className="flex items-center gap-1.5 text-sm">
          {section && (
            <>
              <span className="text-fg-subtle font-medium">{section}</span>
              <ChevronRight size={13} className="text-fg-subtle opacity-50" strokeWidth={2} />
            </>
          )}
          <span className="font-semibold text-fg">{pageTitle}</span>
        </nav>
      </div>

      {/* Right: search + new + bell + user */}
      <div className="flex items-center gap-1.5">
        {/* Search bar */}
        <button
          onClick={() => router.push('/ai')}
          className={cn(
            'hidden md:flex items-center gap-2 px-3 h-8 rounded-md w-60',
            'bg-canvas-subtle border border-ui-border hover:border-ui-border hover:bg-canvas',
            'text-fg-subtle hover:text-fg-muted',
            'transition-all duration-150',
          )}
        >
          <Search size={13} className="shrink-0" />
          <span className="flex-1 text-left text-xs truncate">Search or ask AI…</span>
          <div className="flex items-center gap-0.5 shrink-0 opacity-50">
            <Command size={10} />
            <span className="text-[10px]">K</span>
          </div>
        </button>

        {/* New dropdown */}
        <NewDropdown />

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className={cn(
            'w-8 h-8 rounded-md flex items-center justify-center transition-all duration-150',
            'text-fg-subtle hover:text-fg hover:bg-canvas-subtle',
          )}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun size={15} strokeWidth={1.8} /> : <Moon size={15} strokeWidth={1.8} />}
        </button>

        {/* Notifications */}
        <button
          onClick={() => router.push('/notifications')}
          className={cn(
            'relative w-8 h-8 rounded-md flex items-center justify-center',
            'text-fg-subtle hover:text-fg hover:bg-canvas-subtle',
            'transition-all duration-150',
          )}
        >
          <Bell size={15} strokeWidth={1.8} />
          <AnimatePresence>
            {unreadCount > 0 && (
              <motion.span
                key="badge"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-0.5 bg-blue-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center"
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </motion.span>
            )}
          </AnimatePresence>
        </button>

        <div className="h-4 w-px bg-ui-border mx-0.5" />

        {/* User dropdown */}
        <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                'flex items-center gap-2 rounded-md border border-transparent pl-1.5 pr-2 py-1',
                'text-left transition-all duration-150',
                'hover:border-ui-border hover:bg-canvas-subtle',
                'focus-visible:outline-none',
                'data-[state=open]:border-ui-border data-[state=open]:bg-canvas-subtle',
              )}
              aria-label="Open user menu"
            >
              <div className="relative">
                <div className="h-6 w-6 rounded-full bg-blue-600 flex items-center justify-center text-white text-[10px] font-bold">
                  {initials}
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border-[1.5px] border-white bg-emerald-400" />
              </div>

              <div className="hidden min-w-0 sm:block">
                <p className="truncate text-[12px] font-semibold text-fg-secondary leading-tight">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="truncate text-[10px] text-fg-subtle leading-tight">
                  {user?.role ? parseEnumLabel(user.role) : 'User'}
                </p>
              </div>

              <ChevronDown
                size={11}
                strokeWidth={2.5}
                className={cn('text-fg-subtle transition-transform duration-200', dropdownOpen && 'rotate-180')}
              />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="end"
            side="bottom"
            sideOffset={10}
            collisionPadding={12}
            className="z-[90] w-56 bg-canvas border border-ui-border shadow-lg rounded-xl p-1"
          >
            <DropdownMenuLabel className="px-3 pb-3 pt-2 normal-case tracking-normal text-inherit">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-[11px] font-semibold shrink-0">
                  {initials}
                </div>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="truncate text-[13px] font-semibold text-fg">
                    {user?.firstName} {user?.lastName}
                  </p>
                  <p className="truncate text-[11px] text-fg-muted">{user?.email}</p>
                  <span className="inline-flex items-center rounded-full bg-blue-50 border border-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-blue-600">
                    {user?.role ? parseEnumLabel(user.role) : 'User'}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>

            <DropdownMenuSeparator className="bg-ui-border my-1" />

            <DropdownMenuGroup>
              <DropdownMenuItem
                onSelect={() => router.push('/settings')}
                className="text-[13px] text-fg hover:bg-canvas-subtle focus:bg-canvas-subtle rounded-lg cursor-pointer gap-2.5"
              >
                <User size={14} strokeWidth={1.9} className="text-fg-subtle" />
                <span>Profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => router.push('/settings')}
                className="text-[13px] text-fg hover:bg-canvas-subtle focus:bg-canvas-subtle rounded-lg cursor-pointer gap-2.5"
              >
                <Settings size={14} strokeWidth={1.9} className="text-fg-subtle" />
                <span>Settings</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>

            <DropdownMenuSeparator className="bg-ui-border my-1" />

            <DropdownMenuItem
              onSelect={handleLogout}
              className="text-[13px] text-rose-600 hover:bg-rose-50 focus:bg-rose-50 rounded-lg cursor-pointer gap-2.5"
            >
              <LogOut size={14} strokeWidth={1.9} className="text-rose-400" />
              <span>Sign out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
