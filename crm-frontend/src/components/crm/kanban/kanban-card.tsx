'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import type { Deal } from '@/types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { formatCurrency, getInitials, cn } from '@/lib/utils';

interface KanbanCardProps {
  deal: Deal;
  isOverlay?: boolean;
}

export function KanbanCard({ deal, isOverlay }: KanbanCardProps) {
  const router = useRouter();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: deal.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const ownerFirstName = deal.owner?.firstName ?? '';
  const ownerLastName = deal.owner?.lastName ?? '';

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => {
        if (!isDragging) router.push(`/deals/${deal.id}`);
      }}
      className={cn(
        'bg-canvas border border-ui-border rounded-md p-3 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-shadow',
        isDragging && 'opacity-40',
        isOverlay && 'rotate-2 shadow-xl opacity-100 cursor-grabbing'
      )}
    >
      <p className="text-sm font-medium text-fg line-clamp-2">
        {deal.title}
      </p>
      <p className="text-sm font-semibold text-green-600 mt-1">
        {formatCurrency(deal.value)}
      </p>
      {deal.contact && (
        <p className="text-xs text-fg-muted mt-1">
          {deal.contact.firstName} {deal.contact.lastName}
        </p>
      )}
      <div className="flex items-center justify-between mt-2">
        {deal.closingDate && (
          <p className="text-xs text-fg-subtle">
            {format(new Date(deal.closingDate), 'MMM d')}
          </p>
        )}
        {deal.owner && (
          <Avatar className="w-6 h-6 ml-auto">
            <AvatarFallback className="bg-blue-500 text-white text-[10px]">
              {getInitials(ownerFirstName, ownerLastName)}
            </AvatarFallback>
          </Avatar>
        )}
      </div>
    </div>
  );
}
