'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Search, X, Pencil, Trash2, Mail, Phone,
  Building2, Clock, TrendingUp, ExternalLink, UserCircle,
  ChevronRight, Users, ArrowUpRight,
} from 'lucide-react';
import { contactsApi } from '@/lib/api/contacts.api';
import { queryKeys } from '@/lib/query/query-keys';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pagination } from '@/components/shared/pagination';
import { formatRelativeTime, formatCurrency, getInitials, cn } from '@/lib/utils';
import type { Contact } from '@/types';

// ─── Schema ───────────────────────────────────────────────────────────────────

const schema = z.object({
  firstName: z.string().min(1, 'Required'),
  lastName:  z.string().min(1, 'Required'),
  email:     z.string().email('Invalid email').optional().or(z.literal('')),
  phone:     z.string().optional(),
  jobTitle:  z.string().optional(),
});
type FormData = z.infer<typeof schema>;

// ─── Avatar ───────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  'bg-blue-500',
  'bg-violet-500',
  'bg-emerald-500',
  'bg-rose-500',
  'bg-amber-500',
  'bg-indigo-500',
];

function ContactAvatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const idx       = name.charCodeAt(0) % AVATAR_COLORS.length;
  const sizeClass = size === 'sm' ? 'w-7 h-7 text-[11px]'
    : size === 'lg' ? 'w-11 h-11 text-sm'
    : 'w-8 h-8 text-xs';
  const parts    = name.trim().split(' ');
  const initials = parts.length >= 2
    ? getInitials(parts[0], parts[parts.length - 1])
    : (parts[0]?.[0] ?? '?').toUpperCase();

  return (
    <div className={cn(
      'rounded-full flex items-center justify-center font-bold text-white shrink-0',
      AVATAR_COLORS[idx],
      sizeClass,
    )}>
      {initials}
    </div>
  );
}

// ─── Add / Edit Modal ─────────────────────────────────────────────────────────

function ContactModal({ contact, onClose }: { contact?: Contact | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: contact
      ? { firstName: contact.firstName, lastName: contact.lastName, email: contact.email ?? '', phone: contact.phone ?? '', jobTitle: contact.jobTitle ?? '' }
      : {},
  });

  const onSubmit = async (data: FormData) => {
    try {
      if (contact) {
        await contactsApi.update(contact.id, data);
        toast.success('Contact updated');
      } else {
        await contactsApi.create(data as any);
        toast.success('Contact created');
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 6 }}
        transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="bg-white border border-gray-200 rounded-xl shadow-xl w-full max-w-md p-6"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900">
            {contact ? 'Edit Contact' : 'New Contact'}
          </h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-600 mb-1.5 block font-medium">First Name</Label>
              <Input {...register('firstName')} className="h-9 text-sm" />
              {errors.firstName && <p className="text-[11px] text-rose-500 mt-1">{errors.firstName.message}</p>}
            </div>
            <div>
              <Label className="text-xs text-gray-600 mb-1.5 block font-medium">Last Name</Label>
              <Input {...register('lastName')} className="h-9 text-sm" />
              {errors.lastName && <p className="text-[11px] text-rose-500 mt-1">{errors.lastName.message}</p>}
            </div>
          </div>
          <div>
            <Label className="text-xs text-gray-600 mb-1.5 block font-medium">Email</Label>
            <Input type="email" {...register('email')} className="h-9 text-sm" />
            {errors.email && <p className="text-[11px] text-rose-500 mt-1">{errors.email.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-600 mb-1.5 block font-medium">Phone</Label>
              <Input {...register('phone')} className="h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs text-gray-600 mb-1.5 block font-medium">Job Title</Label>
              <Input {...register('jobTitle')} className="h-9 text-sm" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" isLoading={isSubmitting}>
              {contact ? 'Save changes' : 'Create contact'}
            </Button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ─── Detail Side Panel ────────────────────────────────────────────────────────

function ContactPanel({
  contact,
  onClose,
  onEdit,
}: {
  contact: Contact;
  onClose: () => void;
  onEdit: () => void;
}) {
  const router   = useRouter();
  const fullName = `${contact.firstName} ${contact.lastName}`;

  return (
    <motion.aside
      initial={{ x: '100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0 }}
      transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="fixed right-0 top-0 h-full w-[340px] bg-white border-l border-gray-200 z-40 flex flex-col shadow-xl"
    >
      {/* Header */}
      <div className="px-5 pt-4 pb-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X size={15} />
          </button>
          <div className="flex items-center gap-1.5">
            <button
              onClick={onEdit}
              className="flex items-center gap-1.5 px-2.5 h-7 rounded-md text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 border border-gray-200 transition-all"
            >
              <Pencil size={11} strokeWidth={2} /> Edit
            </button>
            <button
              onClick={() => router.push(`/contacts/${contact.id}`)}
              className="flex items-center gap-1.5 px-2.5 h-7 rounded-md text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 border border-blue-200 transition-all"
            >
              Open <ExternalLink size={10} />
            </button>
          </div>
        </div>

        {/* Avatar + name */}
        <div className="flex items-center gap-3">
          <ContactAvatar name={fullName} size="lg" />
          <div>
            <h3 className="text-[15px] font-semibold text-gray-900">{fullName}</h3>
            {contact.jobTitle && (
              <p className="text-xs text-gray-500 mt-0.5">{contact.jobTitle}</p>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto py-4 px-5 space-y-5 scrollbar-none">
        {/* Contact info */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-gray-400 mb-3">
            Contact Info
          </p>
          <div className="space-y-2">
            {contact.email && (
              <a
                href={`mailto:${contact.email}`}
                className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 transition-colors group"
              >
                <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                  <Mail size={13} className="text-blue-600" />
                </div>
                <span className="text-sm text-gray-600 group-hover:text-gray-900 transition-colors truncate">
                  {contact.email}
                </span>
              </a>
            )}
            {contact.phone && (
              <div className="flex items-center gap-3 p-2.5 rounded-lg">
                <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                  <Phone size={13} className="text-emerald-600" />
                </div>
                <span className="text-sm text-gray-600">{contact.phone}</span>
              </div>
            )}
            {contact.company && (
              <button
                onClick={() => router.push(`/companies/${contact.companyId}`)}
                className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 transition-colors group w-full text-left"
              >
                <div className="w-7 h-7 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
                  <Building2 size={13} className="text-violet-600" />
                </div>
                <span className="text-sm text-gray-600 group-hover:text-gray-900 transition-colors flex-1">
                  {contact.company.name}
                </span>
                <ChevronRight size={13} className="text-gray-300 group-hover:text-gray-500 transition-colors" />
              </button>
            )}
            {contact.lastContactedAt && (
              <div className="flex items-center gap-3 p-2.5 rounded-lg">
                <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                  <Clock size={13} className="text-amber-600" />
                </div>
                <span className="text-sm text-gray-500">
                  Last contacted {formatRelativeTime(contact.lastContactedAt)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Stats */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-gray-400 mb-3">
            Stats
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-white border border-gray-200 rounded-xl p-3.5">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1.5">Total Spent</p>
              <p className="text-base font-bold text-gray-900">{formatCurrency(contact.totalSpent ?? 0)}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-3.5">
              <div className="flex items-center gap-1.5 mb-1.5">
                <TrendingUp size={10} className="text-gray-400" />
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">Deals</p>
              </div>
              <p className="text-base font-bold text-gray-900">—</p>
            </div>
          </div>
        </div>
      </div>
    </motion.aside>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ hasSearch, onAdd }: { hasSearch: boolean; onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <div className="w-14 h-14 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center mb-1">
        <Users size={24} strokeWidth={1.5} className="text-gray-400" />
      </div>
      <p className="text-sm font-semibold text-gray-700">
        {hasSearch ? 'No contacts found' : 'No contacts yet'}
      </p>
      <p className="text-xs text-gray-400 text-center max-w-[220px]">
        {hasSearch
          ? 'Try a different name or email address.'
          : 'Add your first contact to start building relationships.'}
      </p>
      {!hasSearch && (
        <button
          onClick={onAdd}
          className="mt-2 flex items-center gap-1.5 px-3.5 h-8 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors"
        >
          <Plus size={13} strokeWidth={2.5} /> Add Contact
        </button>
      )}
    </div>
  );
}

// ─── Table Row ────────────────────────────────────────────────────────────────

function ContactRow({
  contact,
  isSelected,
  onClick,
  onEdit,
  onDelete,
}: {
  contact: Contact;
  isSelected: boolean;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const fullName = `${contact.firstName} ${contact.lastName}`;

  return (
    <tr
      onClick={onClick}
      className={cn(
        'border-b border-gray-100 cursor-pointer transition-colors duration-150 group',
        isSelected
          ? 'bg-blue-50'
          : 'hover:bg-gray-50',
      )}
    >
      {/* Name + avatar */}
      <td className="px-5 py-3">
        <div className="flex items-center gap-3">
          <ContactAvatar name={fullName} size="sm" />
          <div>
            <p className="text-[13px] font-semibold text-gray-900 leading-tight">{fullName}</p>
            {contact.jobTitle && (
              <p className="text-[11px] text-gray-400 leading-tight mt-0.5">{contact.jobTitle}</p>
            )}
          </div>
        </div>
      </td>

      {/* Email */}
      <td className="px-5 py-3">
        <span className="text-[13px] text-gray-500">{contact.email ?? '—'}</span>
      </td>

      {/* Company */}
      <td className="px-5 py-3">
        {contact.company ? (
          <span className="inline-flex items-center gap-1.5 text-[12px] text-gray-600 bg-gray-100 px-2.5 py-1 rounded-full border border-gray-200">
            <Building2 size={10} className="text-gray-400" />
            {contact.company.name}
          </span>
        ) : (
          <span className="text-gray-300 text-sm">—</span>
        )}
      </td>

      {/* Total spent */}
      <td className="px-5 py-3">
        <span className="text-[13px] font-semibold text-gray-900 tabular-nums">
          {formatCurrency(contact.totalSpent ?? 0)}
        </span>
      </td>

      {/* Last contacted */}
      <td className="px-5 py-3">
        <span className="text-[12px] text-gray-400">
          {contact.lastContactedAt ? formatRelativeTime(contact.lastContactedAt) : '—'}
        </span>
      </td>

      {/* Actions */}
      <td className="px-5 py-3">
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-all"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="divide-y divide-gray-100">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-3 animate-pulse" style={{ animationDelay: `${i * 0.04}s` }}>
          <div className="w-7 h-7 rounded-full bg-gray-200 shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-32 bg-gray-200 rounded-full" />
            <div className="h-2.5 w-20 bg-gray-100 rounded-full" />
          </div>
          <div className="h-3 w-40 bg-gray-200 rounded-full" />
          <div className="h-6 w-24 bg-gray-100 rounded-full" />
          <div className="h-3 w-16 bg-gray-100 rounded-full" />
          <div className="h-3 w-14 bg-gray-100 rounded-full" />
        </div>
      ))}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function ContactsPage() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({ page: 1, limit: 20, search: '' });
  const [modalOpen, setModalOpen]             = useState(false);
  const [editContact, setEditContact]         = useState<Contact | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.contacts.list(filters),
    queryFn:  () => contactsApi.getAll(filters),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => contactsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
      toast.success('Contact deleted');
      setSelectedContact(null);
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Delete failed'),
  });

  const openAdd  = () => { setEditContact(null); setModalOpen(true); };
  const openEdit = (c: Contact) => { setEditContact(c); setModalOpen(true); setSelectedContact(null); };

  const contacts  = data?.data ?? [];
  const hasSearch = !!filters.search;

  return (
    <div className="flex gap-5 min-h-0">
      {/* ── Main panel ─────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 space-y-4">

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {/* Search */}
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search contacts…"
                value={filters.search}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value, page: 1 }))}
                className={cn(
                  'h-9 pl-8 pr-3 text-sm rounded-md w-56',
                  'bg-white border border-gray-200 text-gray-900 placeholder:text-gray-400',
                  'focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10',
                  'transition-all duration-150',
                )}
              />
            </div>

            {data && (
              <span className="text-xs text-gray-400 font-medium tabular-nums">
                {data.meta.total.toLocaleString()} contact{data.meta.total !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 px-3.5 h-9 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
          >
            <Plus size={14} strokeWidth={2.5} />
            Add Contact
          </button>
        </div>

        {/* Table card */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {isLoading ? (
            <TableSkeleton />
          ) : contacts.length === 0 ? (
            <EmptyState hasSearch={hasSearch} onAdd={openAdd} />
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  {['Name', 'Email', 'Company', 'Total Spent', 'Last Contacted', ''].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact) => (
                  <ContactRow
                    key={contact.id}
                    contact={contact}
                    isSelected={selectedContact?.id === contact.id}
                    onClick={() => setSelectedContact(selectedContact?.id === contact.id ? null : contact)}
                    onEdit={() => openEdit(contact)}
                    onDelete={() => { if (confirm('Delete this contact?')) deleteMutation.mutate(contact.id); }}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {data && data.meta.totalPages > 1 && (
          <Pagination
            page={data.meta.page}
            totalPages={data.meta.totalPages}
            total={data.meta.total}
            limit={data.meta.limit}
            onPageChange={(p) => setFilters((f) => ({ ...f, page: p }))}
          />
        )}
      </div>

      {/* ── Detail side panel ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedContact && (
          <ContactPanel
            key={selectedContact.id}
            contact={selectedContact}
            onClose={() => setSelectedContact(null)}
            onEdit={() => openEdit(selectedContact)}
          />
        )}
      </AnimatePresence>

      {/* ── Modal ──────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {modalOpen && (
          <ContactModal
            key="modal"
            contact={editContact}
            onClose={() => { setModalOpen(false); setEditContact(null); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
