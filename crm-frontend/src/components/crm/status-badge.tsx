import { cn } from '@/lib/utils';

// ── Shared pill base ─────────────────────────────────────────────────────────

function Pill({ label, className }: { label: string; className: string }) {
  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold border',
      className,
    )}>
      {label}
    </span>
  );
}

// ── Lead status ───────────────────────────────────────────────────────────────

const leadStyles: Record<string, string> = {
  NEW:         'bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800',
  CONTACTED:   'bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800',
  QUALIFIED:   'bg-green-50 text-green-700 border-green-100 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800',
  UNQUALIFIED: 'bg-red-50 text-red-600 border-red-100 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800',
  NURTURING:   'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800',
  CONVERTED:   'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800',
  LOST:        'bg-shimmer-subtle text-fg-muted border-ui-border',
};

export function LeadStatusBadge({ status }: { status: string }) {
  const label = status.charAt(0) + status.slice(1).toLowerCase();
  return <Pill label={label} className={leadStyles[status] ?? 'bg-shimmer-subtle text-fg-muted border-ui-border'} />;
}

// ── Deal status ───────────────────────────────────────────────────────────────

const dealStyles: Record<string, string> = {
  OPEN:    'bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800',
  WON:     'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800',
  LOST:    'bg-red-50 text-red-600 border-red-100 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800',
  ON_HOLD: 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800',
};

export function DealStatusBadge({ status }: { status: string }) {
  const label = status.replace('_', ' ');
  const display = label.charAt(0) + label.slice(1).toLowerCase();
  return <Pill label={display} className={dealStyles[status] ?? 'bg-shimmer-subtle text-fg-muted border-ui-border'} />;
}

// ── Ticket status ─────────────────────────────────────────────────────────────

const ticketStyles: Record<string, string> = {
  OPEN:        'bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800',
  IN_PROGRESS: 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800',
  WAITING:     'bg-shimmer-subtle text-fg-muted border-ui-border',
  RESOLVED:    'bg-green-50 text-green-700 border-green-100 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800',
  CLOSED:      'bg-shimmer-subtle text-fg-subtle border-ui-border',
};

export function TicketStatusBadge({ status }: { status: string }) {
  const label = status.replace(/_/g, ' ');
  const display = label.charAt(0) + label.slice(1).toLowerCase();
  return <Pill label={display} className={ticketStyles[status] ?? 'bg-shimmer-subtle text-fg-muted border-ui-border'} />;
}

// ── Task status ───────────────────────────────────────────────────────────────

const taskStyles: Record<string, string> = {
  TODO:        'bg-shimmer-subtle text-fg-muted border-ui-border',
  IN_PROGRESS: 'bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800',
  COMPLETED:   'bg-green-50 text-green-700 border-green-100 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800',
  CANCELLED:   'bg-shimmer-subtle text-fg-subtle border-ui-border',
};

export function TaskStatusBadge({ status }: { status: string }) {
  const label = status.replace(/_/g, ' ');
  const display = label.charAt(0) + label.slice(1).toLowerCase();
  return <Pill label={display} className={taskStyles[status] ?? 'bg-shimmer-subtle text-fg-muted border-ui-border'} />;
}

// ── Priority badge ────────────────────────────────────────────────────────────

const priorityStyles: Record<string, string> = {
  LOW:    'bg-shimmer-subtle text-fg-muted border-ui-border',
  MEDIUM: 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800',
  HIGH:   'bg-red-50 text-red-600 border-red-100 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800',
  URGENT: 'bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800',
};

export function PriorityBadge({ priority }: { priority: string }) {
  const label = priority.charAt(0) + priority.slice(1).toLowerCase();
  return <Pill label={label} className={priorityStyles[priority] ?? 'bg-shimmer-subtle text-fg-muted border-ui-border'} />;
}
