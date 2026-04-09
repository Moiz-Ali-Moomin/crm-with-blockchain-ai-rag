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
  open:   { width: 232, transition: { duration: 0.26, ease: [0.25, 0.46, 0.45, 0.94] } },
  closed: { width: 60,  transition: { duration: 0.26, ease: [0.25, 0.46, 0.45, 0.94] } },
};

const labelVariants = {
  open:   { opacity: 1, x: 0,  transition: { delay: 0.08, duration: 0.2 } },
  closed: { opacity: 0, x: -6, transition: { duration: 0.1 } },
};

const groupLabelVariants = {
  open:   { opacity: 1, height: 'auto', transition: { delay: 0.06, duration: 0.18 } },
  closed: { opacity: 0, height: 0,      transition: { duration: 0.1 } },
};

export function Sidebar({ open, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const user     = useAuthStore((s) => s.user);

  const initials = user
    ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
    : 'U';

  return (
    <motion.aside
      variants={sidebarVariants}
      animate={open ? 'open' : 'closed'}
      initial={false}
      className="relative flex flex-col bg-white border-r border-gray-200 shrink-0 overflow-hidden"
      style={{ willChange: 'width' }}
    >
      {/* Logo */}
      <div className="flex items-center h-14 px-4 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
            <span className="text-white text-xs font-black">C</span>
          </div>
          <AnimatePresence mode="wait">
            {open && (
              <motion.span
                key="logo-text"
                variants={labelVariants}
                initial="closed"
                animate="open"
                exit="closed"
                className="text-gray-900 font-bold text-sm tracking-tight whitespace-nowrap"
              >
                CRM Platform
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className={cn(
          'absolute -right-3 top-[62px] z-20 w-6 h-6 rounded-full',
          'bg-white border border-gray-200 shadow-sm',
          'flex items-center justify-center',
          'text-gray-400 hover:text-gray-700 hover:border-gray-300',
          'transition-colors duration-150',
        )}
      >
        {open
          ? <ChevronLeft  size={11} strokeWidth={2.5} />
          : <ChevronRight size={11} strokeWidth={2.5} />
        }
      </button>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 scrollbar-none">
        {navGroups.map((group, gi) => (
          <div key={group.label} className={cn(gi > 0 && 'mt-4')}>
            {/* Group label */}
            <AnimatePresence>
              {open && (
                <motion.p
                  variants={groupLabelVariants}
                  initial="closed"
                  animate="open"
                  exit="closed"
                  className="px-4 mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400 overflow-hidden"
                >
                  {group.label}
                </motion.p>
              )}
            </AnimatePresence>

            <ul className="space-y-0.5 px-2">
              {group.items.map((item) => {
                const isActive =
                  item.href === '/dashboard'
                    ? pathname === '/dashboard'
                    : pathname.startsWith(item.href);
                const Icon = item.icon;

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={!open ? item.label : undefined}
                      className={cn(
                        'flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm font-medium',
                        'transition-all duration-150 group',
                        isActive
                          ? 'bg-blue-50 text-blue-600'
                          : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100',
                        !open && 'justify-center',
                      )}
                    >
                      {/* Active left bar */}
                      {isActive && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-blue-600" />
                      )}

                      <Icon
                        size={16}
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
      <div className="shrink-0 px-3 py-3 border-t border-gray-100">
        <div
          className={cn(
            'flex items-center gap-3 px-2 py-2 rounded-lg',
            'hover:bg-gray-100 transition-colors duration-150 cursor-pointer',
            !open && 'justify-center',
          )}
        >
          {/* Avatar */}
          <div className="relative shrink-0">
            <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-[11px] font-bold">
              {initials}
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-emerald-400 rounded-full border-2 border-white" />
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
                <p className="text-[13px] font-semibold text-gray-800 truncate leading-tight">
                  {user.firstName} {user.lastName}
                </p>
                <p className="text-[11px] text-gray-400 truncate leading-tight mt-0.5">
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
