'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle, Trash2, Pencil, Link, Calendar, Clock, User } from 'lucide-react';
import { tasksApi } from '@/lib/api/tasks.api';
import { queryKeys } from '@/lib/query/query-keys';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TaskStatusBadge, PriorityBadge } from '@/components/crm/status-badge';
import { formatDate, formatRelativeTime } from '@/lib/utils';
import type { Task } from '@/types';

const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

const schema = z.object({
  title: z.string().min(1, 'Required'),
  description: z.string().optional(),
  status: z.string(),
  priority: z.string(),
  dueDate: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

function EditModal({ task, onClose }: { task: Task; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: task.title,
      description: task.description ?? '',
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate ? task.dueDate.slice(0, 10) : '',
    },
  });

  const onSubmit = async (data: FormData) => {
    try {
      await tasksApi.update(task.id, data);
      toast.success('Task updated');
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.detail(task.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Update failed');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-canvas rounded-lg shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold mb-4">Edit Task</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div>
            <Label>Title</Label>
            <Input {...register('title')} />
            {errors.title && <p className="text-xs text-red-500">{errors.title.message}</p>}
          </div>
          <div>
            <Label>Description</Label>
            <textarea
              {...register('description')}
              rows={3}
              className="w-full rounded-md border border-ui-border bg-canvas text-fg px-3 py-2 text-sm resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Status</Label>
              <select
                {...register('status')}
                className="w-full rounded-md border border-ui-border bg-canvas text-fg px-3 py-2 text-sm"
              >
                {TASK_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <Label>Priority</Label>
              <select
                {...register('priority')}
                className="w-full rounded-md border border-ui-border bg-canvas text-fg px-3 py-2 text-sm"
              >
                {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div>
            <Label>Due Date</Label>
            <Input type="date" {...register('dueDate')} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" isLoading={isSubmitting}>Save Changes</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);

  const { data: task, isLoading } = useQuery({
    queryKey: queryKeys.tasks.detail(id),
    queryFn: () => tasksApi.getById(id),
    enabled: !!id,
  });

  const completeMutation = useMutation({
    mutationFn: () => tasksApi.complete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
      toast.success('Task marked complete');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Error'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => tasksApi.delete(id),
    onSuccess: () => {
      toast.success('Task deleted');
      router.push('/tasks');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Delete failed'),
  });

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 bg-shimmer rounded" />
        <div className="h-40 bg-shimmer rounded" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="text-center py-16 text-fg-subtle">
        Task not found.{' '}
        <button onClick={() => router.push('/tasks')} className="text-blue-600 hover:underline">
          Back to Tasks
        </button>
      </div>
    );
  }

  const isOverdue = task.status !== 'COMPLETED' && task.dueDate && new Date(task.dueDate) < new Date();
  const entityPath = task.entityType && task.entityId
    ? `/${task.entityType.toLowerCase()}s/${task.entityId}`
    : null;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/tasks')}
          className="p-1.5 rounded hover:bg-canvas-subtle text-fg-muted"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-xl font-semibold truncate flex-1">{task.title}</h1>
        <div className="flex items-center gap-2">
          {task.status !== 'COMPLETED' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => completeMutation.mutate()}
              isLoading={completeMutation.isPending}
            >
              <CheckCircle size={14} />
              Complete
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Pencil size={14} />
            Edit
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-red-500 border-red-200 hover:bg-red-50"
            onClick={() => { if (confirm('Delete this task?')) deleteMutation.mutate(); }}
            isLoading={deleteMutation.isPending}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <TaskStatusBadge status={task.status} />
            <PriorityBadge priority={task.priority} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {task.description && (
            <p className="text-sm text-fg-secondary whitespace-pre-wrap">
              {task.description}
            </p>
          )}

          <div className="grid grid-cols-2 gap-4 text-sm">
            {task.dueDate && (
              <div className="flex items-center gap-2">
                <Calendar size={14} className="text-fg-subtle shrink-0" />
                <div>
                  <p className="text-xs text-fg-subtle">Due Date</p>
                  <p className={isOverdue ? 'text-red-600 font-medium' : 'text-fg-secondary'}>
                    {formatDate(task.dueDate)}
                    {isOverdue && ' ⚠️ Overdue'}
                  </p>
                </div>
              </div>
            )}

            {task.reminderAt && (
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-fg-subtle shrink-0" />
                <div>
                  <p className="text-xs text-fg-subtle">Reminder</p>
                  <p className="text-fg-secondary">{formatDate(task.reminderAt)}</p>
                </div>
              </div>
            )}

            {task.assignee && (
              <div className="flex items-center gap-2">
                <User size={14} className="text-fg-subtle shrink-0" />
                <div>
                  <p className="text-xs text-fg-subtle">Assignee</p>
                  <p className="text-fg-secondary">
                    {task.assignee.firstName} {task.assignee.lastName}
                  </p>
                </div>
              </div>
            )}

            {entityPath && task.entityType && (
              <div className="flex items-center gap-2">
                <Link size={14} className="text-fg-subtle shrink-0" />
                <div>
                  <p className="text-xs text-fg-subtle">Related To</p>
                  <button
                    onClick={() => router.push(entityPath)}
                    className="text-blue-600 hover:underline"
                  >
                    {task.entityType}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-ui-border pt-3 flex items-center justify-between text-xs text-fg-subtle">
            <span>Created {formatRelativeTime(task.createdAt)}</span>
            {task.completedAt && <span>Completed {formatRelativeTime(task.completedAt)}</span>}
          </div>
        </CardContent>
      </Card>

      {editing && <EditModal task={task} onClose={() => setEditing(false)} />}
    </div>
  );
}
