'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { ticketsApi } from '@/lib/api/tickets.api';
import { queryKeys } from '@/lib/query/query-keys';
import { DataTable } from '@/components/crm/data-table';
import { TicketStatusBadge, PriorityBadge } from '@/components/crm/status-badge';
import { Pagination } from '@/components/shared/pagination';
import { formatRelativeTime } from '@/lib/utils';
import type { Ticket } from '@/types';

const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

const selectClass =
  'h-9 rounded-md border border-ui-border bg-canvas text-fg px-3 text-sm ' +
  'focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 transition-all';

export default function TicketsPage() {
  const router = useRouter();
  const [filters, setFilters] = useState({ page: 1, limit: 20, search: '', status: '', priority: '' });

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.tickets.list(filters),
    queryFn: () => ticketsApi.getAll(filters) as Promise<any>,
  });

  const rows = (data?.data ?? []) as Ticket[];
  const meta = data?.meta as { page: number; totalPages: number; total: number; limit: number } | undefined;

  const columns = [
    { key: 'subject', header: 'Subject', render: (row: Ticket) => <span className="text-[13px] font-semibold text-fg">{row.subject}</span> },
    { key: 'contact', header: 'Contact', render: (row: Ticket) => row.contact ? `${row.contact.firstName} ${row.contact.lastName}` : '—' },
    { key: 'status', header: 'Status', render: (row: Ticket) => <TicketStatusBadge status={row.status} /> },
    { key: 'priority', header: 'Priority', render: (row: Ticket) => <PriorityBadge priority={row.priority} /> },
    { key: 'assignee', header: 'Assignee', render: (row: Ticket) => row.assignee ? `${row.assignee.firstName} ${row.assignee.lastName}` : '—' },
    { key: 'createdAt', header: 'Created', render: (row: Ticket) => <span className="text-[12px] text-fg-subtle">{formatRelativeTime(row.createdAt)}</span> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            placeholder="Search tickets…"
            className="pl-8 w-56 h-9 rounded-md border border-ui-border bg-canvas text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 transition-all"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value, page: 1 }))}
          />
        </div>
        <select
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value, page: 1 }))}
          className={selectClass}
        >
          <option value="">All Statuses</option>
          {TICKET_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <select
          value={filters.priority}
          onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value, page: 1 }))}
          className={selectClass}
        >
          <option value="">All Priorities</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        emptyMessage="No tickets found."
        onRowClick={(row) => router.push(`/tickets/${row.id}`)}
      />

      {meta && (
        <Pagination
          page={meta.page}
          totalPages={meta.totalPages}
          total={meta.total}
          limit={meta.limit}
          onPageChange={(p) => setFilters((f) => ({ ...f, page: p }))}
        />
      )}
    </div>
  );
}
