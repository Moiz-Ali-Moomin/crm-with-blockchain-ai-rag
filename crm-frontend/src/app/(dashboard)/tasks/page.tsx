'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CheckCircle, Trash2, Link } from 'lucide-react';
import { tasksApi } from '@/lib/api/tasks.api';
import { queryKeys } from '@/lib/query/query-keys';
import { useAuthStore } from '@/store/auth.store';
import { DataTable } from '@/components/crm/data-table';
import { PriorityBadge, TaskStatusBadge } from '@/components/crm/status-badge';
import { formatDate, cn } from '@/lib/utils';
import type { Task, PaginatedData } from '@/types';

const TABS = ['My Tasks', 'All Tasks'] as const;

export default function TasksPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<'My Tasks' | 'All Tasks'>('My Tasks');

  const myTasksQuery = useQuery({
    queryKey: queryKeys.tasks.myTasks(user?.id ?? ''),
    queryFn: () => tasksApi.getMyTasks(),
    enabled: !!user?.id && tab === 'My Tasks',
  });

  const allTasksQuery = useQuery({
    queryKey: queryKeys.tasks.list({}),
    queryFn: () => tasksApi.getAll() as Promise<PaginatedData<Task>>,
    enabled: tab === 'All Tasks',
  });

  const completeMutation = useMutation({
    mutationFn: (id: string) => tasksApi.complete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
      toast.success('Task completed');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => tasksApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
      toast.success('Task deleted');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Delete failed'),
  });

  const activeQuery = tab === 'My Tasks' ? myTasksQuery : allTasksQuery;
  const tasks: Task[] = (activeQuery.data as any)?.data ?? [];
  const isLoading = activeQuery.isLoading;

  const columns = [
    {
      key: 'title',
      header: 'Title',
      render: (row: Task) => (
        <span className={cn('text-[13px] font-semibold text-fg', row.status === 'COMPLETED' && 'line-through text-fg-subtle')}>
          {row.title}
        </span>
      ),
    },
    {
      key: 'priority',
      header: 'Priority',
      render: (row: Task) => <PriorityBadge priority={row.priority} />,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row: Task) => <TaskStatusBadge status={row.status} />,
    },
    {
      key: 'dueDate',
      header: 'Due Date',
      render: (row: Task) => {
        if (!row.dueDate) return '—';
        const overdue = row.status !== 'COMPLETED' && new Date(row.dueDate) < new Date();
        return (
          <span className={cn('text-[12px]', overdue ? 'text-red-600 font-medium' : 'text-fg-subtle')}>
            {formatDate(row.dueDate)}
            {overdue && ' ⚠️'}
          </span>
        );
      },
    },
    {
      key: 'assignee',
      header: 'Assignee',
      render: (row: Task) =>
        row.assignee ? `${row.assignee.firstName} ${row.assignee.lastName}` : '—',
    },
    {
      key: 'entity',
      header: 'Related To',
      render: (row: Task) =>
        row.entityType && row.entityId ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              const path = row.entityType!.toLowerCase() + 's';
              router.push(`/${path}/${row.entityId}`);
            }}
            className="flex items-center gap-1 text-blue-600 hover:underline text-xs"
          >
            <Link size={11} />
            {row.entityType}
          </button>
        ) : '—',
    },
    {
      key: 'actions',
      header: '',
      render: (row: Task) => (
        <div className="flex items-center gap-1">
          {row.status !== 'COMPLETED' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                completeMutation.mutate(row.id);
              }}
              title="Complete"
              className="p-1 rounded hover:bg-green-50 text-green-600"
            >
              <CheckCircle size={14} />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (confirm('Delete this task?')) deleteMutation.mutate(row.id);
            }}
            className="p-1 rounded hover:bg-red-50 text-red-500"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="border-b border-ui-border">
        <div className="flex">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t ? 'border-blue-500 text-blue-600' : 'border-transparent text-fg-subtle hover:text-fg'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <DataTable
        columns={columns}
        data={tasks}
        isLoading={isLoading}
        emptyMessage="No tasks found."
      />
    </div>
  );
}
