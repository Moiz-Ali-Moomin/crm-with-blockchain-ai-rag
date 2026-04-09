'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Search, Eye, Pencil, Trash2, ExternalLink, X } from 'lucide-react';
import { companiesApi } from '@/lib/api/companies.api';
import { queryKeys } from '@/lib/query/query-keys';
import { Label } from '@/components/ui/label';
import { DataTable } from '@/components/crm/data-table';
import { Pagination } from '@/components/shared/pagination';
import { formatCurrency } from '@/lib/utils';
import type { Company } from '@/types';

const schema = z.object({
  name: z.string().min(1, 'Required'),
  industry: z.string().optional(),
  website: z.string().optional(),
  phone: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  employeeCount: z.coerce.number().optional(),
  annualRevenue: z.coerce.number().optional(),
});
type FormData = z.infer<typeof schema>;

const inputClass =
  'w-full h-9 rounded-md border border-gray-200 bg-white text-gray-900 px-3 text-sm ' +
  'placeholder:text-gray-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 transition-all';

function CompanyModal({ company, onClose }: { company?: Company | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: company
      ? { name: company.name, industry: company.industry ?? '', website: company.website ?? '', phone: company.phone ?? '', city: company.city ?? '', country: company.country ?? '', employeeCount: company.employeeCount ?? undefined, annualRevenue: company.annualRevenue ?? undefined }
      : {},
  });

  const onSubmit = async (data: FormData) => {
    try {
      if (company) {
        await companiesApi.update(company.id, data);
        toast.success('Company updated');
      } else {
        await companiesApi.create(data);
        toast.success('Company created');
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white border border-gray-200 rounded-xl shadow-xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[15px] font-semibold text-gray-900">{company ? 'Edit Company' : 'Add Company'}</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X size={15} />
          </button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label className="text-xs text-gray-600 font-medium mb-1.5 block">Company Name</Label>
            <input {...register('name')} className={inputClass} placeholder="Acme Corp" />
            {errors.name && <p className="text-[11px] text-rose-500 mt-1">{errors.name.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-600 font-medium mb-1.5 block">Industry</Label>
              <input {...register('industry')} className={inputClass} placeholder="Technology" />
            </div>
            <div>
              <Label className="text-xs text-gray-600 font-medium mb-1.5 block">Website</Label>
              <input {...register('website')} className={inputClass} placeholder="https://" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-600 font-medium mb-1.5 block">Phone</Label>
              <input {...register('phone')} className={inputClass} placeholder="+1 234 567 8900" />
            </div>
            <div>
              <Label className="text-xs text-gray-600 font-medium mb-1.5 block">City</Label>
              <input {...register('city')} className={inputClass} placeholder="New York" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-600 font-medium mb-1.5 block">Employees</Label>
              <input type="number" {...register('employeeCount')} className={inputClass} placeholder="100" />
            </div>
            <div>
              <Label className="text-xs text-gray-600 font-medium mb-1.5 block">Annual Revenue</Label>
              <input type="number" {...register('annualRevenue')} className={inputClass} placeholder="1000000" />
            </div>
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
              {isSubmitting ? 'Saving…' : company ? 'Save Changes' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function CompaniesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({ page: 1, limit: 20, search: '' });
  const [modalOpen, setModalOpen] = useState(false);
  const [editCompany, setEditCompany] = useState<Company | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.companies.list(filters),
    queryFn: () => companiesApi.getAll(filters) as Promise<any>,
  });

  const rows = (data?.data ?? []) as Company[];
  const meta = data?.meta as { page: number; totalPages: number; total: number; limit: number } | undefined;

  const deleteMutation = useMutation({
    mutationFn: (id: string) => companiesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      toast.success('Company deleted');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Delete failed'),
  });

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (row: Company) => <span className="text-[13px] font-semibold text-gray-900">{row.name}</span>,
    },
    {
      key: 'industry',
      header: 'Industry',
      render: (row: Company) => row.industry ?? '—',
    },
    {
      key: 'website',
      header: 'Website',
      render: (row: Company) =>
        row.website ? (
          <a href={row.website} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 text-blue-600 hover:underline text-[13px]">
            <ExternalLink size={12} />
            {row.website.replace(/^https?:\/\//, '')}
          </a>
        ) : '—',
    },
    {
      key: 'employeeCount',
      header: 'Employees',
      render: (row: Company) => row.employeeCount?.toLocaleString() ?? '—',
    },
    {
      key: 'annualRevenue',
      header: 'Revenue',
      render: (row: Company) => row.annualRevenue ? formatCurrency(row.annualRevenue) : '—',
    },
    {
      key: 'city',
      header: 'City',
      render: (row: Company) => row.city ?? '—',
    },
    {
      key: 'actions',
      header: '',
      render: (row: Company) => (
        <div className="flex items-center gap-1">
          <button onClick={(e) => { e.stopPropagation(); router.push(`/companies/${row.id}`); }} className="w-7 h-7 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <Eye size={14} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); setEditCompany(row); setModalOpen(true); }} className="w-7 h-7 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <Pencil size={14} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); if (confirm('Delete this company?')) deleteMutation.mutate(row.id); }} className="w-7 h-7 rounded-md flex items-center justify-center text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors">
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            placeholder="Search companies…"
            className="pl-8 w-56 h-9 rounded-md border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 transition-all"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value, page: 1 }))}
          />
        </div>
        <button
          onClick={() => { setEditCompany(null); setModalOpen(true); }}
          className="flex items-center gap-1.5 px-3.5 h-9 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
        >
          <Plus size={14} /> Add Company
        </button>
      </div>

      <DataTable columns={columns} data={rows} isLoading={isLoading} emptyMessage="No companies found." onRowClick={(row) => router.push(`/companies/${row.id}`)} />

      {meta && (
        <Pagination
          page={meta.page}
          totalPages={meta.totalPages}
          total={meta.total}
          limit={meta.limit}
          onPageChange={(p) => setFilters((f) => ({ ...f, page: p }))}
        />
      )}

      {modalOpen && <CompanyModal company={editCompany} onClose={() => { setModalOpen(false); setEditCompany(null); }} />}
    </div>
  );
}
