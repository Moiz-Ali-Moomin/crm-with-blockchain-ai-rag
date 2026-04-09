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
  NEW:         'bg-blue-50 text-blue-700 border-blue-100',
  CONTACTED:   'bg-blue-50 text-blue-700 border-blue-100',
  QUALIFIED:   'bg-green-50 text-green-700 border-green-100',
  UNQUALIFIED: 'bg-red-50 text-red-600 border-red-100',
  NURTURING:   'bg-amber-50 text-amber-700 border-amber-100',
  CONVERTED:   'bg-emerald-50 text-emerald-700 border-emerald-100',
  LOST:        'bg-gray-100 text-gray-500 border-gray-200',
};

export function LeadStatusBadge({ status }: { status: string }) {
  const label = status.charAt(0) + status.slice(1).toLowerCase();
  return <Pill label={label} className={leadStyles[status] ?? 'bg-gray-100 text-gray-500 border-gray-200'} />;
}

// ── Deal status ───────────────────────────────────────────────────────────────

const dealStyles: Record<string, string> = {
  OPEN:    'bg-blue-50 text-blue-700 border-blue-100',
  WON:     'bg-emerald-50 text-emerald-700 border-emerald-100',
  LOST:    'bg-red-50 text-red-600 border-red-100',
  ON_HOLD: 'bg-amber-50 text-amber-700 border-amber-100',
};

export function DealStatusBadge({ status }: { status: string }) {
  const label = status.replace('_', ' ');
  const display = label.charAt(0) + label.slice(1).toLowerCase();
  return <Pill label={display} className={dealStyles[status] ?? 'bg-gray-100 text-gray-500 border-gray-200'} />;
}

// ── Ticket status ─────────────────────────────────────────────────────────────

const ticketStyles: Record<string, string> = {
  OPEN:        'bg-blue-50 text-blue-700 border-blue-100',
  IN_PROGRESS: 'bg-amber-50 text-amber-700 border-amber-100',
  WAITING:     'bg-gray-100 text-gray-500 border-gray-200',
  RESOLVED:    'bg-green-50 text-green-700 border-green-100',
  CLOSED:      'bg-gray-100 text-gray-400 border-gray-200',
};

export function TicketStatusBadge({ status }: { status: string }) {
  const label = status.replace(/_/g, ' ');
  const display = label.charAt(0) + label.slice(1).toLowerCase();
  return <Pill label={display} className={ticketStyles[status] ?? 'bg-gray-100 text-gray-500 border-gray-200'} />;
}

// ── Task status ───────────────────────────────────────────────────────────────

const taskStyles: Record<string, string> = {
  TODO:        'bg-gray-100 text-gray-500 border-gray-200',
  IN_PROGRESS: 'bg-blue-50 text-blue-700 border-blue-100',
  COMPLETED:   'bg-green-50 text-green-700 border-green-100',
  CANCELLED:   'bg-gray-100 text-gray-400 border-gray-200',
};

export function TaskStatusBadge({ status }: { status: string }) {
  const label = status.replace(/_/g, ' ');
  const display = label.charAt(0) + label.slice(1).toLowerCase();
  return <Pill label={display} className={taskStyles[status] ?? 'bg-gray-100 text-gray-500 border-gray-200'} />;
}

// ── Priority badge ────────────────────────────────────────────────────────────

const priorityStyles: Record<string, string> = {
  LOW:    'bg-gray-100 text-gray-500 border-gray-200',
  MEDIUM: 'bg-amber-50 text-amber-700 border-amber-100',
  HIGH:   'bg-red-50 text-red-600 border-red-100',
  URGENT: 'bg-rose-50 text-rose-700 border-rose-100',
};

export function PriorityBadge({ priority }: { priority: string }) {
  const label = priority.charAt(0) + priority.slice(1).toLowerCase();
  return <Pill label={label} className={priorityStyles[priority] ?? 'bg-gray-100 text-gray-500 border-gray-200'} />;
}
