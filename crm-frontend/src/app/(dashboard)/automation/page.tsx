'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch } from '@/lib/api/client';
import { DataTable } from '@/components/crm/data-table';
import { formatRelativeTime } from '@/lib/utils';
import { toast } from 'sonner';
import type { Workflow, PaginatedData } from '@/types';

const WORKFLOW_KEY = ['workflows'] as const;

export default function AutomationPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: WORKFLOW_KEY,
    queryFn: () => apiGet<PaginatedData<Workflow>>('/automation/workflows'),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) =>
      apiPatch<Workflow>(`/automation/workflows/${id}/toggle`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WORKFLOW_KEY });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Error'),
  });

  const columns = [
    { key: 'name', header: 'Name', render: (row: Workflow) => <span className="text-[13px] font-semibold text-fg">{row.name}</span> },
    {
      key: 'triggerType',
      header: 'Trigger',
      render: (row: Workflow) => (
        <span className="text-[12px] text-fg-muted">{row.triggerType.replace(/_/g, ' ')}</span>
      ),
    },
    {
      key: 'isActive',
      header: 'Active',
      render: (row: Workflow) => (
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={row.isActive}
            onChange={() => toggleMutation.mutate(row.id)}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
        </label>
      ),
    },
    { key: 'runCount', header: 'Runs', render: (row: Workflow) => row.runCount.toLocaleString() },
    {
      key: 'errorCount',
      header: 'Errors',
      render: (row: Workflow) => (
        <span className={row.errorCount > 0 ? 'text-red-500 font-medium' : 'text-fg-subtle'}>
          {row.errorCount}
        </span>
      ),
    },
    {
      key: 'updatedAt',
      header: 'Last Updated',
      render: (row: Workflow) => (
        <span className="text-[12px] text-fg-subtle">{formatRelativeTime(row.updatedAt)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        emptyMessage="No workflows found."
      />
    </div>
  );
}
