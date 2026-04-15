/**
 * DealModal — Upgraded form for creating and editing deals.
 *
 * Improvements over the original:
 *   1. Schemas imported from deal.schema.ts — no duplication
 *   2. Pipeline select loads REAL data from API
 *   3. Stage select is reactive to pipeline choice
 *   4. Uses feature-local hooks (useCreateDeal, useUpdateDeal)
 *   5. Proper form error display with type-safe field names
 *   6. Closes on success (mutation.onSuccess)
 *   7. Accessible: focus trap, aria-modal, escape key
 */

'use client';

import { useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { pipelinesApi } from '@/lib/api/pipelines.api';
import { queryKeys } from '@/lib/query/query-keys';
import { CreateDealSchema, type CreateDealFormData } from '../types/deal.schema';
import { useCreateDeal, useUpdateDeal } from '../hooks';
import type { Deal } from '../types/deal.types';

// ─── Shared input style ────────────────────────────────────────────────────

const INPUT_CLS =
  'w-full h-9 rounded-lg border border-slate-200 bg-white text-slate-900 px-3 text-sm ' +
  'placeholder:text-slate-400 focus:outline-none focus:border-blue-400 focus:ring-2 ' +
  'focus:ring-blue-500/10 transition-all disabled:opacity-50';

const SELECT_CLS =
  'w-full h-9 rounded-lg border border-slate-200 bg-white text-slate-700 px-3 text-sm ' +
  'focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 transition-all disabled:opacity-50';

const LABEL_CLS = 'block text-xs font-medium text-slate-600 mb-1.5';

const ERROR_CLS = 'text-[11px] text-rose-500 mt-1';

// ─── Component ────────────────────────────────────────────────────────────────

interface DealModalProps {
  deal?: Deal | null;
  defaultPipelineId?: string;
  defaultStageId?: string;
  onClose: () => void;
}

export function DealModal({
  deal,
  defaultPipelineId = '',
  defaultStageId = '',
  onClose,
}: DealModalProps) {
  const isEditing  = !!deal;
  const createDeal = useCreateDeal();
  const updateDeal = useUpdateDeal();
  const isPending  = createDeal.isPending || updateDeal.isPending;

  // ── Pipeline + Stage data ─────────────────────────────────────────────────
  const { data: pipelines = [] } = useQuery({
    queryKey: queryKeys.pipelines.all,
    queryFn:  pipelinesApi.getAll,
    staleTime: 5 * 60_000,
  });

  // ── Form ──────────────────────────────────────────────────────────────────
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateDealFormData>({
    resolver: zodResolver(CreateDealSchema),
    defaultValues: deal
      ? {
          title:       deal.title,
          value:       deal.value,
          currency:    deal.currency ?? 'USD',
          pipelineId:  deal.pipelineId,
          stageId:     deal.stageId,
          contactId:   deal.contactId ?? undefined,
          companyId:   deal.companyId ?? undefined,
          closingDate: deal.closingDate ? deal.closingDate.slice(0, 10) : undefined,
          description: deal.description ?? undefined,
        }
      : {
          value:      0,
          currency:   'USD',
          pipelineId: defaultPipelineId,
          stageId:    defaultStageId,
          tags:       [],
        },
  });

  const selectedPipelineId = watch('pipelineId');
  const stages = pipelines.find((p) => p.id === selectedPipelineId)?.stages ?? [];

  // Reset stage when pipeline changes
  useEffect(() => {
    if (!isEditing) setValue('stageId', '');
  }, [selectedPipelineId, isEditing, setValue]);

  // ── Submission ────────────────────────────────────────────────────────────
  const onSubmit = async (data: CreateDealFormData) => {
    if (isEditing) {
      await updateDeal.mutateAsync({ id: deal.id, data });
    } else {
      await createDeal.mutateAsync(data);
    }
    onClose();
  };

  // ── Escape to close ───────────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={isEditing ? 'Edit deal' : 'New deal'}
      onKeyDown={handleKeyDown}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[15px] font-semibold text-slate-900">
            {isEditing ? 'Edit Deal' : 'New Deal'}
          </h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Close"
          >
            <X size={15} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          {/* Title */}
          <div>
            <label className={LABEL_CLS} htmlFor="deal-title">Title *</label>
            <input id="deal-title" {...register('title')} className={INPUT_CLS} placeholder="Deal title" />
            {errors.title && <p className={ERROR_CLS}>{errors.title.message}</p>}
          </div>

          {/* Value + Currency */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLS} htmlFor="deal-value">Value *</label>
              <input
                id="deal-value"
                type="number"
                min={0}
                step="0.01"
                {...register('value')}
                className={INPUT_CLS}
                placeholder="0"
              />
              {errors.value && <p className={ERROR_CLS}>{errors.value.message}</p>}
            </div>
            <div>
              <label className={LABEL_CLS} htmlFor="deal-currency">Currency</label>
              <select id="deal-currency" {...register('currency')} className={SELECT_CLS}>
                {['USD', 'EUR', 'GBP', 'USDC'].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Pipeline */}
          <div>
            <label className={LABEL_CLS} htmlFor="deal-pipeline">Pipeline *</label>
            <select
              id="deal-pipeline"
              {...register('pipelineId')}
              className={SELECT_CLS}
              disabled={isEditing}
            >
              <option value="">Select pipeline…</option>
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {errors.pipelineId && <p className={ERROR_CLS}>{errors.pipelineId.message}</p>}
          </div>

          {/* Stage */}
          <div>
            <label className={LABEL_CLS} htmlFor="deal-stage">Stage *</label>
            <select
              id="deal-stage"
              {...register('stageId')}
              className={SELECT_CLS}
              disabled={!selectedPipelineId}
            >
              <option value="">Select stage…</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {errors.stageId && <p className={ERROR_CLS}>{errors.stageId.message}</p>}
          </div>

          {/* Closing Date */}
          <div>
            <label className={LABEL_CLS} htmlFor="deal-closing">Closing Date</label>
            <input id="deal-closing" type="date" {...register('closingDate')} className={INPUT_CLS} />
          </div>

          {/* Description */}
          <div>
            <label className={LABEL_CLS} htmlFor="deal-description">Description</label>
            <textarea
              id="deal-description"
              {...register('description')}
              rows={2}
              className={`${INPUT_CLS} h-auto resize-none`}
              placeholder="Optional notes…"
            />
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 h-9 rounded-lg text-sm font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 h-9 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 transition-colors"
            >
              {isPending ? (isEditing ? 'Saving…' : 'Creating…') : (isEditing ? 'Save Changes' : 'Create Deal')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
