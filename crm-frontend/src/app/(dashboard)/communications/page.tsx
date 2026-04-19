'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Mail, MessageSquare, X } from 'lucide-react';
import { communicationsApi } from '@/lib/api/communications.api';
import { queryKeys } from '@/lib/query/query-keys';
import { Label } from '@/components/ui/label';
import { DataTable } from '@/components/crm/data-table';
import { Pagination } from '@/components/shared/pagination';
import { formatRelativeTime, cn } from '@/lib/utils';
import type { Communication } from '@/types';

// ─── Schemas ─────────────────────────────────────────────────────────────────

const emailSchema = z.object({
  toAddr:  z.string().email('Invalid email'),
  subject: z.string().min(1, 'Required'),
  body:    z.string().min(1, 'Required'),
});
type EmailForm = z.infer<typeof emailSchema>;

const smsSchema = z.object({
  toAddr: z.string().min(5, 'Enter a phone number'),
  body:   z.string().min(1, 'Required'),
});
type SmsForm = z.infer<typeof smsSchema>;

// ─── Shared input styles ──────────────────────────────────────────────────────

const inputClass =
  'w-full h-9 rounded-md border border-ui-border bg-canvas text-fg px-3 text-sm ' +
  'placeholder:text-fg-subtle focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 transition-all';

const textareaClass =
  'w-full rounded-md border border-ui-border bg-canvas text-fg px-3 py-2 text-sm resize-none ' +
  'placeholder:text-fg-subtle focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 transition-all';

// ─── Email Modal ──────────────────────────────────────────────────────────────

function EmailModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<EmailForm>({
    resolver: zodResolver(emailSchema),
  });

  const onSubmit = async (data: EmailForm) => {
    try {
      await communicationsApi.sendEmail(data);
      toast.success('Email queued');
      queryClient.invalidateQueries({ queryKey: queryKeys.communications.all });
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to send');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-canvas border border-ui-border rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-blue-50"><Mail size={14} className="text-blue-600" /></div>
            <h2 className="text-[15px] font-semibold text-fg">Send Email</h2>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-md text-fg-subtle hover:text-fg hover:bg-canvas-subtle transition-colors">
            <X size={15} />
          </button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label className="text-xs text-fg-muted font-medium mb-1.5 block">To</Label>
            <input type="email" {...register('toAddr')} className={inputClass} placeholder="recipient@example.com" />
            {errors.toAddr && <p className="text-[11px] text-rose-500 mt-1">{errors.toAddr.message}</p>}
          </div>
          <div>
            <Label className="text-xs text-fg-muted font-medium mb-1.5 block">Subject</Label>
            <input {...register('subject')} className={inputClass} placeholder="Email subject" />
            {errors.subject && <p className="text-[11px] text-rose-500 mt-1">{errors.subject.message}</p>}
          </div>
          <div>
            <Label className="text-xs text-fg-muted font-medium mb-1.5 block">Body</Label>
            <textarea {...register('body')} rows={4} className={textareaClass} placeholder="Write your message…" />
            {errors.body && <p className="text-[11px] text-rose-500 mt-1">{errors.body.message}</p>}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-3.5 h-8 rounded-md text-sm font-medium text-fg-secondary border border-ui-border hover:bg-canvas-subtle transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-3.5 h-8 rounded-md text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 transition-colors"
            >
              {isSubmitting ? 'Sending…' : 'Send Email'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── SMS Modal ────────────────────────────────────────────────────────────────

function SmsModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<SmsForm>({
    resolver: zodResolver(smsSchema),
  });

  const onSubmit = async (data: SmsForm) => {
    try {
      await communicationsApi.sendSms(data);
      toast.success('SMS queued');
      queryClient.invalidateQueries({ queryKey: queryKeys.communications.all });
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to send');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-canvas border border-ui-border rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-50"><MessageSquare size={14} className="text-emerald-600" /></div>
            <h2 className="text-[15px] font-semibold text-fg">Send SMS</h2>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-md text-fg-subtle hover:text-fg hover:bg-canvas-subtle transition-colors">
            <X size={15} />
          </button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label className="text-xs text-fg-muted font-medium mb-1.5 block">To (phone number)</Label>
            <input {...register('toAddr')} className={inputClass} placeholder="+1 234 567 8900" />
            {errors.toAddr && <p className="text-[11px] text-rose-500 mt-1">{errors.toAddr.message}</p>}
          </div>
          <div>
            <Label className="text-xs text-fg-muted font-medium mb-1.5 block">Message</Label>
            <textarea {...register('body')} rows={3} className={textareaClass} placeholder="Write your message…" />
            {errors.body && <p className="text-[11px] text-rose-500 mt-1">{errors.body.message}</p>}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-3.5 h-8 rounded-md text-sm font-medium text-fg-secondary border border-ui-border hover:bg-canvas-subtle transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-3.5 h-8 rounded-md text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 transition-colors"
            >
              {isSubmitting ? 'Sending…' : 'Send SMS'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Channel badge ────────────────────────────────────────────────────────────

const CHANNEL_STYLES: Record<string, string> = {
  EMAIL:    'bg-blue-50 text-blue-700 border-blue-100',
  SMS:      'bg-emerald-50 text-emerald-700 border-emerald-100',
  WHATSAPP: 'bg-green-50 text-green-700 border-green-100',
  PHONE:    'bg-amber-50 text-amber-700 border-amber-100',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CommunicationsPage() {
  const router = useRouter();
  const [filters, setFilters]         = useState({ page: 1, limit: 20 });
  const [emailModalOpen, setEmailOpen] = useState(false);
  const [smsModalOpen, setSmsOpen]     = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.communications.list(filters),
    queryFn:  () => communicationsApi.getAll(filters) as Promise<any>,
  });

  // API returns { data: Communication[], meta: { page, totalPages, total, limit } }
  const rows = (data?.data ?? []) as Communication[];
  const meta  = data?.meta as { page: number; totalPages: number; total: number; limit: number } | undefined;

  const columns = [
    {
      key: 'channel',
      header: 'Channel',
      render: (row: Communication) => (
        <span className={cn(
          'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold border',
          CHANNEL_STYLES[row.channel] ?? 'bg-canvas-subtle text-fg-muted border-ui-border',
        )}>
          {row.channel}
        </span>
      ),
    },
    {
      key: 'direction',
      header: 'Dir.',
      render: (row: Communication) => (
        <span className="text-[12px] text-fg-muted uppercase tracking-wide">{row.direction}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row: Communication) => (
        <span className="text-[12px] text-fg-secondary">{row.status}</span>
      ),
    },
    {
      key: 'fromAddr',
      header: 'From',
      render: (row: Communication) => (
        <span className="text-[12px] text-fg-muted truncate">{row.fromAddr}</span>
      ),
    },
    {
      key: 'toAddr',
      header: 'To',
      render: (row: Communication) => (
        <span className="text-[12px] text-fg-muted truncate">{row.toAddr}</span>
      ),
    },
    {
      key: 'subject',
      header: 'Subject',
      render: (row: Communication) => (
        <span className="text-[13px] text-fg-secondary">{row.subject ?? '—'}</span>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (row: Communication) =>
        row.contact ? (
          <button
            onClick={(e) => { e.stopPropagation(); router.push(`/contacts/${row.contactId}`); }}
            className="text-[13px] text-blue-600 hover:text-blue-700 hover:underline transition-colors"
          >
            {row.contact.firstName} {row.contact.lastName}
          </button>
        ) : <span className="text-fg-subtle text-[13px]">—</span>,
    },
    {
      key: 'createdAt',
      header: 'Date',
      render: (row: Communication) => (
        <span className="text-[12px] text-fg-subtle">{formatRelativeTime(row.createdAt)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <button
          onClick={() => setEmailOpen(true)}
          className="flex items-center gap-1.5 px-3.5 h-9 rounded-md border border-ui-border text-sm font-medium text-fg-secondary hover:bg-canvas-subtle transition-colors"
        >
          <Mail size={14} className="text-fg-subtle" /> Send Email
        </button>
        <button
          onClick={() => setSmsOpen(true)}
          className="flex items-center gap-1.5 px-3.5 h-9 rounded-md border border-ui-border text-sm font-medium text-fg-secondary hover:bg-canvas-subtle transition-colors"
        >
          <MessageSquare size={14} className="text-fg-subtle" /> Send SMS
        </button>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        emptyMessage="No communications found."
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

      {emailModalOpen && <EmailModal onClose={() => setEmailOpen(false)} />}
      {smsModalOpen   && <SmsModal  onClose={() => setSmsOpen(false)} />}
    </div>
  );
}
