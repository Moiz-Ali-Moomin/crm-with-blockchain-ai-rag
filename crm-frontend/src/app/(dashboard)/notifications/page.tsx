'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Trash2, CheckCheck } from 'lucide-react';
import { notificationsApi } from '@/lib/api/notifications.api';
import { queryKeys } from '@/lib/query/query-keys';
import { useAuthStore } from '@/store/auth.store';
import { formatRelativeTime, cn } from '@/lib/utils';
import type { Notification } from '@/types';

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.notifications.list(user?.id ?? ''),
    queryFn: () => notificationsApi.getAll() as Promise<any>,
    enabled: !!user?.id,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
      toast.success('All marked as read');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => notificationsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Error'),
  });

  const notifications = (data?.data ?? []) as Notification[];

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex justify-end">
        <button
          onClick={() => markAllReadMutation.mutate()}
          disabled={markAllReadMutation.isPending}
          className="flex items-center gap-1.5 px-3.5 h-8 rounded-md border border-ui-border text-sm font-medium text-fg-secondary hover:bg-canvas-subtle disabled:opacity-60 transition-colors"
        >
          <CheckCheck size={14} />
          Mark All Read
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 bg-shimmer-subtle rounded-xl animate-pulse" />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No notifications.</p>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <div
              key={n.id}
              onClick={() => !n.isRead && markReadMutation.mutate(n.id)}
              className={cn(
                'flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors',
                n.isRead
                  ? 'border-ui-border-subtle bg-canvas hover:bg-canvas-subtle'
                  : 'border-blue-100 bg-blue-50 hover:bg-blue-50/80 dark:border-blue-800 dark:bg-blue-900/20 dark:hover:bg-blue-900/30'
              )}
            >
              {!n.isRead && (
                <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-1.5" />
              )}
              <div className="flex-1 min-w-0">
                <p className={cn('text-[13px] font-semibold', n.isRead ? 'text-fg-muted' : 'text-fg')}>
                  {n.title}
                </p>
                <p className="text-[12px] text-fg-muted truncate mt-0.5">{n.body}</p>
                <p className="text-[11px] text-fg-subtle mt-1">{formatRelativeTime(n.createdAt)}</p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteMutation.mutate(n.id);
                }}
                className="w-7 h-7 rounded-md flex items-center justify-center text-gray-400 hover:text-rose-500 hover:bg-rose-50 shrink-0 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
