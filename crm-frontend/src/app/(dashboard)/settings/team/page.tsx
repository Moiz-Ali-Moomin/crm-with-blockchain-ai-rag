'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { UserPlus } from 'lucide-react';
import { usersApi } from '@/lib/api/users.api';
import { queryKeys } from '@/lib/query/query-keys';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/crm/data-table';
import { formatRelativeTime } from '@/lib/utils';
import type { User, PaginatedData } from '@/types';

const ROLES = ['ADMIN', 'SALES_MANAGER', 'SALES_REP', 'SUPPORT_AGENT', 'VIEWER'];

const inviteSchema = z.object({
  email: z.string().email('Invalid email'),
  firstName: z.string().min(1, 'Required'),
  lastName: z.string().min(1, 'Required'),
  role: z.string().optional(),
});
type InviteForm = z.infer<typeof inviteSchema>;

const STATUS_VARIANT: Record<string, string> = {
  ACTIVE: 'success', INACTIVE: 'secondary', INVITED: 'info', SUSPENDED: 'destructive',
};
const ROLE_VARIANT: Record<string, string> = {
  ADMIN: 'info', SUPER_ADMIN: 'destructive', SALES_MANAGER: 'warning', SALES_REP: 'secondary', SUPPORT_AGENT: 'secondary', VIEWER: 'outline',
};

function InviteModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<InviteForm>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { role: 'SALES_REP' },
  });

  const onSubmit = async (data: InviteForm) => {
    try {
      await usersApi.invite(data);
      toast.success('Invitation sent');
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-canvas rounded-lg shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold mb-4">Invite Team Member</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div><Label>Email</Label><Input type="email" {...register('email')} />{errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}</div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>First Name</Label><Input {...register('firstName')} />{errors.firstName && <p className="text-xs text-red-500">{errors.firstName.message}</p>}</div>
            <div><Label>Last Name</Label><Input {...register('lastName')} />{errors.lastName && <p className="text-xs text-red-500">{errors.lastName.message}</p>}</div>
          </div>
          <div>
            <Label>Role</Label>
            <select {...register('role')} className="w-full rounded-md border border-ui-border bg-canvas text-fg px-3 py-2 text-sm">
              {ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" isLoading={isSubmitting}>Send Invite</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function TeamPage() {
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.users.list({}),
    queryFn: () => usersApi.getAll() as Promise<PaginatedData<User>>,
  });

  const roleChangeMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => usersApi.updateRole(id, role),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: queryKeys.users.all }); toast.success('Role updated'); },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Error'),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      active ? usersApi.deactivate(id) : usersApi.activate(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: queryKeys.users.all }); toast.success('Status updated'); },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Error'),
  });

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (row: User) => <span className="font-medium">{row.firstName} {row.lastName}</span>,
    },
    { key: 'email', header: 'Email', render: (row: User) => <span className="text-fg-muted">{row.email}</span> },
    {
      key: 'role',
      header: 'Role',
      render: (row: User) => (
        <select
          defaultValue={row.role}
          onChange={(e) => roleChangeMutation.mutate({ id: row.id, role: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          className="rounded border border-ui-border bg-canvas text-fg px-2 py-1 text-xs"
        >
          {ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
        </select>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row: User) => <Badge variant={(STATUS_VARIANT[row.status] ?? 'secondary') as any}>{row.status}</Badge>,
    },
    {
      key: 'lastLoginAt',
      header: 'Last Login',
      render: (row: User) => (
        <span className="text-xs text-fg-subtle">
          {row.lastLoginAt ? formatRelativeTime(row.lastLoginAt) : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (row: User) => (
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation();
            toggleActiveMutation.mutate({ id: row.id, active: row.status === 'ACTIVE' });
          }}
        >
          {row.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setInviteOpen(true)}>
          <UserPlus size={16} />
          Invite Member
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        emptyMessage="No team members."
      />

      {inviteOpen && <InviteModal onClose={() => setInviteOpen(false)} />}
    </div>
  );
}
