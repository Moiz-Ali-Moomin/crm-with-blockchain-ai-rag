'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Users, UserCircle, Building2, TrendingUp,
  GitBranch, Ticket, Activity, CheckSquare, MessageSquare,
  Zap, BarChart2, Settings, UsersRound, ChevronLeft, ChevronRight,
  Brain,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { cn } from '@/lib/utils';

interface SidebarProps {
  open: boolean;
  onToggle: () => void;
}

const navGroups = [
  {
    label: 'Overview',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'CRM',
    items: [
      { label: 'Leads',     href: '/leads',     icon: Users },
      { label: 'Contacts',  href: '/contacts',  icon: UserCircle },
      { label: 'Companies', href: '/companies', icon: Building2 },
      { label: 'Deals',     href: '/deals',     icon: TrendingUp },
      { label: 'Pipeline',  href: '/pipeline',  icon: GitBranch },
    ],
  },
  {
    label: 'Support',
    items: [
      { label: 'Tickets',        href: '/tickets',        icon: Ticket },
      { label: 'Activities',     href: '/activities',     icon: Activity },
      { label: 'Tasks',          href: '/tasks',          icon: CheckSquare },
      { label: 'Communications', href: '/communications', icon: MessageSquare },
    ],
  },
  {
    label: 'Automation',
    items: [
      { label: 'Workflows', href: '/automation', icon: Zap },
      { label: 'Analytics', href: '/analytics',  icon: BarChart2 },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { label: 'AI Copilot', href: '/ai', icon: Brain },
    ],
  },
  {
    label: 'Settings',
    items: [
      { label: 'Settings', href: '/settings',      icon: Settings },
      { label: 'Team',     href: '/settings/team', icon: UsersRound },
    ],
  },
];

const sidebarVariants = {
  open:   { width: 224, transition: { duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] } },
  closed: { width: 56,  transition: { duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] } },
};

const labelVariants = {
  open:   { opacity: 1, x: 0,  transition: { delay: 0.07, duration: 0.18 } },
  closed: { opacity: 0, x: -6, transition: { duration: 0.1 } },
};

const groupLabelVariants = {
  open:   { opacity: 1, height: 'auto', transition: { delay: 0.05, duration: 0.16 } },
  closed: { opacity: 0, height: 0,      transition: { duration: 0.08 } },
};

export function Sidebar({ open, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const user     = useAuthStore((s) => s.user);

  const initials = user
    ? (`${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`).toUpperCase() || 'U'
    : 'U';

  return (
    <motion.aside
      variants={sidebarVariants}
      animate={open ? 'open' : 'closed'}
      initial={false}
      className="relative flex flex-col bg-canvas border-r border-ui-border shrink-0 overflow-visible"
      style={{ willChange: 'width' }}
    >
      {/* Logo */}
      <div className="flex items-center h-14 px-4 border-b border-ui-border shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
            <span className="text-white text-xs font-black tracking-tight">C</span>
          </div>
          <AnimatePresence mode="wait">
            {open && (
              <motion.span
                key="logo-text"
                variants={labelVariants}
                initial="closed"
                animate="open"
                exit="closed"
                className="text-fg font-bold text-[13px] tracking-tight whitespace-nowrap"
              >
                CRM Platform
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Collapse toggle — fully visible button above the border */}
      <button
        onClick={onToggle}
        className={cn(
          'absolute -right-3.5 top-[62px] z-30',
          'w-7 h-7 rounded-full',
          'bg-canvas border border-ui-border shadow-md',
          'flex items-center justify-center',
          'text-fg-muted hover:text-fg hover:border-ui-border hover:shadow-lg',
          'transition-all duration-150',
        )}
        title={open ? 'Collapse sidebar' : 'Expand sidebar'}
      >
        {open
          ? <ChevronLeft  size={12} strokeWidth={2.5} />
          : <ChevronRight size={12} strokeWidth={2.5} />
        }
      </button>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 scrollbar-none">
        {navGroups.map((group, gi) => (
          <div key={group.label} className={cn(gi > 0 && 'mt-1')}>
            {gi > 0 && (
              <AnimatePresence>
                {open ? (
                  <motion.div
                    variants={groupLabelVariants}
                    initial="closed"
                    animate="open"
                    exit="closed"
                    className="overflow-hidden"
                  >
                    <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.11em] text-fg-subtle">
                      {group.label}
                    </p>
                  </motion.div>
                ) : (
                  <div className="mx-3 my-2 h-px bg-ui-border" />
                )}
              </AnimatePresence>
            )}

            {gi === 0 && (
              <AnimatePresence>
                {open && (
                  <motion.p
                    variants={groupLabelVariants}
                    initial="closed"
                    animate="open"
                    exit="closed"
                    className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.11em] text-fg-subtle overflow-hidden"
                  >
                    {group.label}
                  </motion.p>
                )}
              </AnimatePresence>
            )}

            <ul className="space-y-px px-2">
              {group.items.map((item) => {
                const isActive =
                  item.href === '/dashboard'
                    ? pathname === '/dashboard'
                    : pathname.startsWith(item.href);
                const Icon = item.icon;

                return (
                  <li key={item.href} className="relative">
                    <Link
                      href={item.href}
                      title={!open ? item.label : undefined}
                      className={cn(
                        'flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] font-medium',
                        'transition-all duration-150',
                        isActive
                          ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
                          : 'text-fg-secondary hover:text-fg hover:bg-canvas-subtle',
                        !open && 'justify-center',
                      )}
                    >
                      {isActive && open && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[18px] rounded-r-full bg-blue-600" />
                      )}
                      <Icon
                        size={15}
                        strokeWidth={isActive ? 2.2 : 1.8}
                        className="shrink-0"
                      />
                      <AnimatePresence mode="wait">
                        {open && (
                          <motion.span
                            key={`label-${item.href}`}
                            variants={labelVariants}
                            initial="closed"
                            animate="open"
                            exit="closed"
                            className="whitespace-nowrap overflow-hidden"
                          >
                            {item.label}
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* User profile */}
      <div className="shrink-0 px-2 py-3 border-t border-ui-border">
        <div
          className={cn(
            'flex items-center gap-2.5 px-2.5 py-2 rounded-md',
            'hover:bg-canvas-subtle transition-colors duration-150 cursor-pointer',
            !open && 'justify-center',
          )}
        >
          <div className="relative shrink-0">
            <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-[11px] font-bold">
              {initials}
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-emerald-400 rounded-full border-2 border-canvas" />
          </div>

          <AnimatePresence mode="wait">
            {open && user && (
              <motion.div
                key="user-info"
                variants={labelVariants}
                initial="closed"
                animate="open"
                exit="closed"
                className="min-w-0 overflow-hidden"
              >
                <p className="text-[12px] font-semibold text-fg truncate leading-tight">
                  {user.firstName} {user.lastName}
                </p>
                <p className="text-[11px] text-fg-subtle truncate leading-tight mt-0.5">
                  {user.role.replace(/_/g, ' ')}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.aside>
  );
}
