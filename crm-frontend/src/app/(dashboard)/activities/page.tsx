'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { activitiesApi } from '@/lib/api/activities.api';
import { queryKeys } from '@/lib/query/query-keys';
import { DataTable } from '@/components/crm/data-table';
import { Pagination } from '@/components/shared/pagination';
import { formatRelativeTime } from '@/lib/utils';
import type { Activity, PaginatedData } from '@/types';

const ACTIVITY_TYPES = ['CALL', 'EMAIL', 'MEETING', 'NOTE', 'TASK', 'SMS', 'WHATSAPP'];
const ENTITY_TYPES   = ['LEAD', 'CONTACT', 'COMPANY', 'DEAL', 'TICKET'];

const ICONS: Record<string, string> = {
  CALL: '📞',
  EMAIL: '✉️',
  MEETING: '🤝',
  NOTE: '📝',
  TASK: '✅',
  SMS: '💬',
  WHATSAPP: '💬',
};

type Filters = {
  page: number;
  limit: number;
  type: string;
  entityType: string;
};

const selectClass =
  'h-9 rounded-md border border-ui-border bg-canvas text-fg px-3 text-sm ' +
  'focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 transition-all';

export default function ActivitiesPage() {
  const router = useRouter();

  const [filters, setFilters] = useState<Filters>({
    page: 1,
    limit: 20,
    type: '',
    entityType: '',
  });

  // ✅ Correct type
  const { data, isLoading } = useQuery<PaginatedData<Activity>>({
    queryKey: queryKeys.activities.list(filters),
    queryFn: () => activitiesApi.getAll(filters),
  });

  const rows = data?.data ?? [];

  // ✅ FIX: map actual API shape (no meta)
  const meta = data
    ? {
        page: data.page,
        totalPages: data.totalPages,
        total: data.total,
        limit: data.limit,
      }
    : undefined;

  const columns = [
    {
      key: 'type',
      header: 'Type',
      render: (row: Activity) => {
        const label = row.type.charAt(0) + row.type.slice(1).toLowerCase();
        const icon  = ICONS[row.type] ?? '📌';
        return `${icon} ${label}`;
      },
    },
    {
      key: 'subject',
      header: 'Subject',
      render: (row: Activity) => row.subject,
    },
    {
      key: 'entity',
      header: 'Related To',
      render: (row: Activity) => row.entityType,
    },
    {
      key: 'duration',
      header: 'Duration',
      render: (row: Activity) => (row.duration ? `${row.duration} min` : '—'),
    },
    {
      key: 'createdBy',
      header: 'Created By',
      render: (row: Activity) =>
        row.createdBy
          ? `${row.createdBy.firstName} ${row.createdBy.lastName}`
          : '—',
    },
    {
      key: 'createdAt',
      header: 'Date',
      render: (row: Activity) => formatRelativeTime(row.createdAt),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-2.5">
        <select
          value={filters.type}
          onChange={(e) =>
            setFilters((f) => ({ ...f, type: e.target.value, page: 1 }))
          }
          className={selectClass}
        >
          <option value="">All Types</option>
          {ACTIVITY_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.charAt(0) + t.slice(1).toLowerCase()}
            </option>
          ))}
        </select>

        <select
          value={filters.entityType}
          onChange={(e) =>
            setFilters((f) => ({
              ...f,
              entityType: e.target.value,
              page: 1,
            }))
          }
          className={selectClass}
        >
          <option value="">All Entities</option>
          {ENTITY_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.charAt(0) + t.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        emptyMessage="No activities found."
        onRowClick={(row) => {
          const activity = row as Activity;
          const path = activity.entityType.toLowerCase() + 's';
          router.push(`/${path}/${activity.entityId}`);
        }}
      />

      {/* Pagination */}
      {meta && (
        <Pagination
          page={meta.page}
          totalPages={meta.totalPages}
          total={meta.total}
          limit={meta.limit}
          onPageChange={(p) =>
            setFilters((f) => ({ ...f, page: p }))
          }
        />
      )}
    </div>
  );
}