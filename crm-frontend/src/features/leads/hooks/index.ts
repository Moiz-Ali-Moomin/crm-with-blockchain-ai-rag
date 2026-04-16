import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { leadsApi, CreateLeadDto, LeadFilters } from '@/lib/api/leads.api';
import { queryKeys } from '@/lib/query/query-keys';

export function useLeads(filters?: LeadFilters) {
  return useQuery({
    queryKey: queryKeys.leads.list(filters),
    queryFn: () => leadsApi.getAll(filters),
  });
}

export function useLead(id: string) {
  return useQuery({
    queryKey: queryKeys.leads.detail(id),
    queryFn: () => leadsApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateLeadDto) => leadsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.leads.all });
      toast.success('Lead created');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Create failed'),
  });
}

export function useUpdateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateLeadDto> }) =>
      leadsApi.update(id, data),
    onSuccess: (_r: unknown, { id }: { id: string; data: Partial<CreateLeadDto> }) => {
      qc.invalidateQueries({ queryKey: queryKeys.leads.all });
      qc.invalidateQueries({ queryKey: queryKeys.leads.detail(id) });
      toast.success('Lead updated');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Update failed'),
  });
}

export function useDeleteLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => leadsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.leads.all });
      toast.success('Lead deleted');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Delete failed'),
  });
}

export function useConvertLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof leadsApi.convert>[1] }) =>
      leadsApi.convert(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.leads.all });
      toast.success('Lead converted');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Convert failed'),
  });
}
