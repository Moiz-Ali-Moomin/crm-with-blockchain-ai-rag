'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, Pencil, Trash2, Plus, Search } from 'lucide-react';
import { useLeads, useDeleteLead } from '@/features/leads/hooks';
import { LeadModal } from '@/features/leads/components/lead-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DataTable } from '@/components/crm/data-table';
import { LeadStatusBadge } from '@/components/crm/status-badge';
import { ScoreBadge } from '@/components/crm/score-badge';
import { Pagination } from '@/components/shared/pagination';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { formatRelativeTime, getInitials } from '@/lib/utils';
import { LEAD_STATUSES, LEAD_SOURCES } from '@/features/leads/constants';
import type { Lead } from '@/types';

export default function LeadsPage() {
  const router = useRouter();
  const [filters, setFilters] = useState({ page: 1, limit: 20, search: '', status: '', source: '' });
  const [modalOpen, setModalOpen] = useState(false);
  const [editLead, setEditLead] = useState<Lead | null>(null);

  const { data, isLoading } = useLeads(filters);
  const deleteLead = useDeleteLead();

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (row: Lead) => (
        <span className="font-medium">{row.firstName} {row.lastName}</span>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      render: (row: Lead) => <span className="text-fg-muted">{row.email ?? '—'}</span>,
    },
    {
      key: 'companyName',
      header: 'Company',
      render: (row: Lead) => row.companyName ?? '—',
    },
    {
      key: 'status',
      header: 'Status',
      render: (row: Lead) => <LeadStatusBadge status={row.status} />,
    },
    {
      key: 'score',
      header: 'Score',
      render: (row: Lead) => <ScoreBadge score={row.score} />,
    },
    {
      key: 'source',
      header: 'Source',
      render: (row: Lead) => (
        <span className="text-xs text-fg-muted">{row.source.replace(/_/g, ' ')}</span>
      ),
    },
    {
      key: 'assignee',
      header: 'Assignee',
      render: (row: Lead) =>
        row.assignee ? (
          <Avatar className="w-7 h-7">
            <AvatarFallback className="bg-blue-500 text-white text-[10px]">
              {getInitials(row.assignee.firstName, row.assignee.lastName)}
            </AvatarFallback>
          </Avatar>
        ) : (
          <span className="text-fg-subtle">—</span>
        ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (row: Lead) => (
        <span className="text-xs text-fg-subtle">{formatRelativeTime(row.createdAt)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (row: Lead) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); router.push(`/leads/${row.id}`); }}
            className="w-7 h-7 flex items-center justify-center rounded-md text-fg-subtle hover:text-fg hover:bg-canvas-subtle transition-all"
          >
            <Eye size={13} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setEditLead(row); setModalOpen(true); }}
            className="w-7 h-7 flex items-center justify-center rounded-md text-fg-subtle hover:text-fg hover:bg-canvas-subtle transition-all"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (confirm('Delete this lead?')) deleteLead.mutate(row.id);
            }}
            className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-all"
          >
            <Trash2 size={13} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search leads…"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value, page: 1 }))}
              className="h-9 pl-8 pr-3 text-sm rounded-md w-56 bg-canvas border border-ui-border text-fg placeholder:text-fg-subtle focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 transition-all duration-150"
            />
          </div>
          <select
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value, page: 1 }))}
            className="h-9 rounded-md border border-ui-border bg-canvas text-fg px-3 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 transition-all"
          >
            <option value="">All Statuses</option>
            {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={filters.source}
            onChange={(e) => setFilters((f) => ({ ...f, source: e.target.value, page: 1 }))}
            className="h-9 rounded-md border border-ui-border bg-canvas text-fg px-3 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 transition-all"
          >
            <option value="">All Sources</option>
            {LEAD_SOURCES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        <button
          onClick={() => { setEditLead(null); setModalOpen(true); }}
          className="flex items-center gap-1.5 px-3.5 h-9 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
        >
          <Plus size={14} strokeWidth={2.5} />
          Add Lead
        </button>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        emptyMessage="No leads found."
        onRowClick={(row) => router.push(`/leads/${row.id}`)}
      />

      {data && (
        <Pagination
          page={data.meta.page}
          totalPages={data.meta.totalPages}
          total={data.meta.total}
          limit={data.meta.limit}
          onPageChange={(p) => setFilters((f) => ({ ...f, page: p }))}
        />
      )}

      {modalOpen && (
        <LeadModal
          lead={editLead}
          onClose={() => { setModalOpen(false); setEditLead(null); }}
        />
      )}
    </div>
  );
}
