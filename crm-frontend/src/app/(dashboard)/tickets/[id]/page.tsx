'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Send } from 'lucide-react';
import { ticketsApi } from '@/lib/api/tickets.api';
import { queryKeys } from '@/lib/query/query-keys';
import { useAuthStore } from '@/store/auth.store';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { TicketStatusBadge, PriorityBadge } from '@/components/crm/status-badge';
import { formatDate, formatRelativeTime, getInitials } from '@/lib/utils';

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [replyBody, setReplyBody] = useState('');
  const [isInternal, setIsInternal] = useState(false);

  const { data: ticket, isLoading } = useQuery({
    queryKey: queryKeys.tickets.detail(id),
    queryFn: () => ticketsApi.getById(id),
  });

  const addReplyMutation = useMutation({
    mutationFn: (data: { body: string; isInternal: boolean }) =>
      ticketsApi.addReply(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tickets.detail(id) });
      setReplyBody('');
      toast.success('Reply added');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Error'),
  });

  if (isLoading) return <div className="h-40 animate-pulse bg-shimmer rounded-lg" />;
  if (!ticket) return <p>Ticket not found.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-1.5 rounded-md hover:bg-canvas-subtle text-fg-muted">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-bold">{ticket.subject}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <TicketStatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: ticket info */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Ticket Info</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {ticket.contact && (
              <div>
                <span className="text-fg-subtle">Contact:</span>{' '}
                <button onClick={() => router.push(`/contacts/${ticket.contactId}`)} className="text-blue-600 hover:underline">
                  {ticket.contact.firstName} {ticket.contact.lastName}
                </button>
              </div>
            )}
            {ticket.assignee && (
              <div>
                <span className="text-fg-subtle">Assignee:</span>{' '}
                {ticket.assignee.firstName} {ticket.assignee.lastName}
              </div>
            )}
            <div>
              <span className="text-fg-subtle">Created:</span>{' '}
              {formatDate(ticket.createdAt)}
            </div>
            {ticket.resolvedAt && (
              <div>
                <span className="text-fg-subtle">Resolved:</span>{' '}
                {formatDate(ticket.resolvedAt)}
              </div>
            )}
            <div className="pt-2 border-t border-ui-border">
              <p className="text-fg-muted">{ticket.description}</p>
            </div>
          </CardContent>
        </Card>

        {/* Right: reply thread */}
        <div className="lg:col-span-2 space-y-3">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Thread ({ticket.replies?.length ?? 0})</CardTitle></CardHeader>
            <CardContent>
              {ticket.replies?.length ? (
                <div className="space-y-4">
                  {ticket.replies.map((reply) => (
                    <div key={reply.id} className="flex gap-3">
                      <Avatar className="w-8 h-8 shrink-0">
                        <AvatarFallback className="bg-fg-subtle text-canvas text-xs">
                          {getInitials(reply.author.firstName, reply.author.lastName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            {reply.author.firstName} {reply.author.lastName}
                          </span>
                          {reply.isInternal && (
                            <Badge variant="warning" className="text-xs">Internal</Badge>
                          )}
                          <span className="text-xs text-fg-subtle">{formatRelativeTime(reply.createdAt)}</span>
                        </div>
                        <p className="text-sm text-fg-secondary mt-1">{reply.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-fg-subtle">No replies yet.</p>
              )}
            </CardContent>
          </Card>

          {/* Reply form */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <textarea
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                placeholder="Write a reply..."
                rows={3}
                className="w-full rounded-md border border-ui-border bg-canvas text-fg px-3 py-2 text-sm resize-none"
              />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={isInternal}
                    onChange={(e) => setIsInternal(e.target.checked)}
                  />
                  Internal note
                </label>
                <Button
                  size="sm"
                  onClick={() => {
                    if (!replyBody.trim()) return;
                    addReplyMutation.mutate({ body: replyBody, isInternal });
                  }}
                  isLoading={addReplyMutation.isPending}
                >
                  <Send size={14} />
                  Send Reply
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
