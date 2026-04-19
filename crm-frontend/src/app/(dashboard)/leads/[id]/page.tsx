'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Edit, RefreshCw, Calendar, Mail, Phone, Building2, User } from 'lucide-react';
import { leadsApi } from '@/lib/api/leads.api';
import { activitiesApi } from '@/lib/api/activities.api';
import { tasksApi } from '@/lib/api/tasks.api';
import { queryKeys } from '@/lib/query/query-keys';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LeadStatusBadge, PriorityBadge, TaskStatusBadge } from '@/components/crm/status-badge';
import { ScoreBadge } from '@/components/crm/score-badge';
import { formatDate, formatRelativeTime } from '@/lib/utils';

const ACTIVITY_ICONS: Record<string, string> = {
  CALL: '📞', EMAIL: '✉️', MEETING: '🤝', NOTE: '📝', TASK: '✅', SMS: '💬', WHATSAPP: '💬',
};

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [convertOpen, setConvertOpen] = useState(false);
  const [createDeal, setCreateDeal] = useState(false);

  const { data: lead, isLoading } = useQuery({
    queryKey: queryKeys.leads.detail(id),
    queryFn: () => leadsApi.getById(id),
  });

  const { data: activitiesData } = useQuery({
    queryKey: queryKeys.activities.timeline('LEAD', id),
    queryFn: () => activitiesApi.getTimeline('LEAD', id),
    enabled: !!id,
  });

  const { data: tasksData } = useQuery({
    queryKey: queryKeys.tasks.list({ entityType: 'LEAD', entityId: id }),
    queryFn: () => tasksApi.getAll({ entityType: 'LEAD', entityId: id }),
    enabled: !!id,
  });

  const convertMutation = useMutation({
    mutationFn: (data: object) => leadsApi.convert(id, data as any),
    onSuccess: () => {
      toast.success('Lead converted successfully');
      queryClient.invalidateQueries({ queryKey: queryKeys.leads.detail(id) });
      setConvertOpen(false);
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Conversion failed'),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-20 bg-shimmer rounded-lg animate-pulse" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-64 bg-shimmer rounded-lg animate-pulse" />
          <div className="h-64 bg-shimmer rounded-lg animate-pulse" />
        </div>
      </div>
    );
  }

  if (!lead) return <p>Lead not found.</p>;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-1.5 rounded-md hover:bg-canvas-subtle text-fg-muted"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold">{lead.firstName} {lead.lastName}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <LeadStatusBadge status={lead.status} />
              <ScoreBadge score={lead.score} />
              {lead.assignee && (
                <span className="text-xs text-fg-muted">
                  Assigned to {lead.assignee.firstName} {lead.assignee.lastName}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {lead.status !== 'CONVERTED' && (
            <Button variant="outline" onClick={() => setConvertOpen(true)}>
              <RefreshCw size={14} />
              Convert
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: info + activities */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Lead Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {lead.email && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail size={14} className="text-fg-subtle shrink-0" />
                  <a href={`mailto:${lead.email}`} className="text-blue-600 hover:underline">{lead.email}</a>
                </div>
              )}
              {lead.phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone size={14} className="text-fg-subtle shrink-0" />
                  <span>{lead.phone}</span>
                </div>
              )}
              {lead.companyName && (
                <div className="flex items-center gap-2 text-sm">
                  <Building2 size={14} className="text-fg-subtle shrink-0" />
                  <span>{lead.companyName}</span>
                </div>
              )}
              {lead.jobTitle && (
                <div className="flex items-center gap-2 text-sm">
                  <User size={14} className="text-fg-subtle shrink-0" />
                  <span>{lead.jobTitle}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-sm">
                <Calendar size={14} className="text-fg-subtle shrink-0" />
                <span className="text-fg-muted">Created {formatDate(lead.createdAt)}</span>
              </div>
              {lead.source && (
                <div className="text-sm text-fg-muted">
                  Source: <span className="font-medium">{lead.source.replace(/_/g, ' ')}</span>
                </div>
              )}
              {lead.notes && (
                <div className="text-sm text-fg-secondary bg-canvas-subtle rounded p-2">
                  {lead.notes}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Activities Timeline */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Activity Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {activitiesData?.data?.length ? (
                <div className="space-y-3">
                  {activitiesData.data.slice(0, 10).map((a) => (
                    <div key={a.id} className="flex gap-3">
                      <span className="text-lg">{ACTIVITY_ICONS[a.type] ?? '📌'}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{a.subject}</p>
                        {a.body && <p className="text-xs text-fg-muted truncate">{a.body}</p>}
                        <p className="text-xs text-fg-subtle">{formatRelativeTime(a.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-fg-subtle">No activities yet.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: tasks */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Tasks</CardTitle>
            </CardHeader>
            <CardContent>
              {tasksData?.data?.length ? (
                <div className="space-y-2">
                  {tasksData.data.map((t) => (
                    <div key={t.id} className="flex items-center justify-between p-2 rounded border border-ui-border">
                      <div>
                        <p className="text-sm font-medium">{t.title}</p>
                        {t.dueDate && (
                          <p className="text-xs text-fg-subtle">{formatDate(t.dueDate)}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <PriorityBadge priority={t.priority} />
                        <TaskStatusBadge status={t.status} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-fg-subtle">No tasks.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Convert modal */}
      {convertOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-canvas rounded-lg shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-4">Convert Lead</h2>
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={createDeal}
                  onChange={(e) => setCreateDeal(e.target.checked)}
                />
                Create a deal
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setConvertOpen(false)}>Cancel</Button>
              <Button
                isLoading={convertMutation.isPending}
                onClick={() => convertMutation.mutate({ createContact: true, createDeal })}
              >
                Convert
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
