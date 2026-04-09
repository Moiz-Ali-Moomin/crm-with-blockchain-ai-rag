'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Search, Eye, Trash2, LayoutList, LayoutGrid, X } from 'lucide-react';
import { dealsApi } from '@/lib/api/deals.api';
import { pipelinesApi } from '@/lib/api/pipelines.api';
import { queryKeys } from '@/lib/query/query-keys';
import { Label } from '@/components/ui/label';
import { DataTable } from '@/components/crm/data-table';
import { DealStatusBadge } from '@/components/crm/status-badge';
import { KanbanBoard } from '@/components/crm/kanban/kanban-board';
import { Pagination } from '@/components/shared/pagination';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import type { Deal } from '@/types';

const schema = z.object({
  title: z.string().min(1, 'Required'),
  value: z.coerce.number().min(0),
  pipelineId: z.string().min(1, 'Required'),
  stageId: z.string().min(1, 'Required'),
  closingDate: z.string().optional(),
  description: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

const inputClass =
  'w-full h-9 rounded-md border border-gray-200 bg-white text-gray-900 px-3 text-sm ' +
  'placeholder:text-gray-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 transition-all';

const selectClass =
  'w-full h-9 rounded-md border border-gray-200 bg-white text-gray-700 px-3 text-sm ' +
  'focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 transition-all';

function DealModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [selectedPipelineId, setSelectedPipelineId] = useState('');

  const { data: pipelines } = useQuery({
    queryKey: queryKeys.pipelines.all,
    queryFn: pipelinesApi.getAll,
  });

  const stages = pipelines?.find((p) => p.id === selectedPipelineId)?.stages ?? [];

  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { value: 0 },
  });

  const onSubmit = async (data: FormData) => {
    try {
      await dealsApi.create(data);
      toast.success('Deal created');
      queryClient.invalidateQueries({ queryKey: queryKeys.deals.all });
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white border border-gray-200 rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[15px] font-semibold text-gray-900">New Deal</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X size={15} />
          </button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label className="text-xs text-gray-600 font-medium mb-1.5 block">Title</Label>
            <input {...register('title')} className={inputClass} placeholder="Deal title" />
            {errors.title && <p className="text-[11px] text-rose-500 mt-1">{errors.title.message}</p>}
          </div>
          <div>
            <Label className="text-xs text-gray-600 font-medium mb-1.5 block">Value ($)</Label>
            <input type="number" min={0} {...register('value')} className={inputClass} placeholder="0" />
          </div>
          <div>
            <Label className="text-xs text-gray-600 font-medium mb-1.5 block">Pipeline</Label>
            <select
              {...register('pipelineId')}
              onChange={(e) => {
                setValue('pipelineId', e.target.value);
                setSelectedPipelineId(e.target.value);
                setValue('stageId', '');
              }}
              className={selectClass}
            >
              <option value="">Select pipeline</option>
              {pipelines?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {errors.pipelineId && <p className="text-[11px] text-rose-500 mt-1">{errors.pipelineId.message}</p>}
          </div>
          <div>
            <Label className="text-xs text-gray-600 font-medium mb-1.5 block">Stage</Label>
            <select {...register('stageId')} className={selectClass}>
              <option value="">Select stage</option>
              {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {errors.stageId && <p className="text-[11px] text-rose-500 mt-1">{errors.stageId.message}</p>}
          </div>
          <div>
            <Label className="text-xs text-gray-600 font-medium mb-1.5 block">Closing Date</Label>
            <input type="date" {...register('closingDate')} className={inputClass} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-3.5 h-8 rounded-md text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-3.5 h-8 rounded-md text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 transition-colors"
            >
              {isSubmitting ? 'Creating…' : 'Create Deal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function DealsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [view, setView] = useState<'list' | 'kanban'>('list');
  const [filters, setFilters] = useState({ page: 1, limit: 20, search: '' });
  const [modalOpen, setModalOpen] = useState(false);

  const { data: pipelines } = useQuery({ queryKey: queryKeys.pipelines.all, queryFn: pipelinesApi.getAll });
  const defaultPipelineId = pipelines?.find((p) => p.isDefault)?.id ?? pipelines?.[0]?.id ?? '';

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.deals.list(filters),
    queryFn: () => dealsApi.getAll(filters),
    enabled: view === 'list',
  });

  const rows = (data as any)?.data ?? [] as Deal[];
  const meta = (data as any)?.meta as { page: number; totalPages: number; total: number; limit: number } | undefined;

  const deleteMutation = useMutation({
    mutationFn: (id: string) => dealsApi.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: queryKeys.deals.all }); toast.success('Deal deleted'); },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Delete failed'),
  });

  const columns = [
    { key: 'title', header: 'Title', render: (row: Deal) => <span className="text-[13px] font-semibold text-gray-900">{row.title}</span> },
    { key: 'contact', header: 'Contact', render: (row: Deal) => row.contact ? `${row.contact.firstName} ${row.contact.lastName}` : '—' },
    { key: 'company', header: 'Company', render: (row: Deal) => row.company?.name ?? '—' },
    { key: 'stage', header: 'Stage', render: (row: Deal) => row.stage?.name ?? '—' },
    { key: 'value', header: 'Value', render: (row: Deal) => <span className="text-[13px] font-semibold text-emerald-600">{formatCurrency(row.value)}</span> },
    { key: 'status', header: 'Status', render: (row: Deal) => <DealStatusBadge status={row.status} /> },
    { key: 'closingDate', header: 'Closing', render: (row: Deal) => row.closingDate ? formatDate(row.closingDate) : '—' },
    {
      key: 'actions', header: '',
      render: (row: Deal) => (
        <div className="flex items-center gap-1">
          <button onClick={(e) => { e.stopPropagation(); router.push(`/deals/${row.id}`); }} className="w-7 h-7 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <Eye size={14} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); if (confirm('Delete this deal?')) deleteMutation.mutate(row.id); }} className="w-7 h-7 rounded-md flex items-center justify-center text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors">
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {view === 'list' && (
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                placeholder="Search deals…"
                className="pl-8 w-48 h-9 rounded-md border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 transition-all"
                value={filters.search}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value, page: 1 }))}
              />
            </div>
          )}
          <div className="flex items-center border border-gray-200 rounded-md overflow-hidden">
            <button
              onClick={() => setView('list')}
              className={cn('p-2 transition-colors', view === 'list' ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-50 text-gray-400')}
            >
              <LayoutList size={15} />
            </button>
            <button
              onClick={() => setView('kanban')}
              className={cn('p-2 transition-colors', view === 'kanban' ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-50 text-gray-400')}
            >
              <LayoutGrid size={15} />
            </button>
          </div>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-1.5 px-3.5 h-9 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
        >
          <Plus size={14} /> New Deal
        </button>
      </div>

      {view === 'list' ? (
        <>
          <DataTable columns={columns} data={rows} isLoading={isLoading} emptyMessage="No deals found." onRowClick={(row) => router.push(`/deals/${row.id}`)} />
          {meta && (
            <Pagination
              page={meta.page}
              totalPages={meta.totalPages}
              total={meta.total}
              limit={meta.limit}
              onPageChange={(p) => setFilters((f) => ({ ...f, page: p }))}
            />
          )}
        </>
      ) : (
        defaultPipelineId && <KanbanBoard pipelineId={defaultPipelineId} />
      )}

      {modalOpen && <DealModal onClose={() => setModalOpen(false)} />}
    </div>
  );
}
