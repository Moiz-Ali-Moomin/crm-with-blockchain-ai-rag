/**
 * Deal Feature — Zod Schemas
 *
 * Single source of truth for all deal form validation schemas.
 * Previously duplicated across deals/page.tsx and deals/components/deal-modal.tsx.
 */

import { z } from 'zod';

export const CreateDealSchema = z.object({
  title:       z.string().min(1, 'Title is required'),
  value:       z.coerce.number().min(0, 'Value must be ≥ 0'),
  currency:    z.string().default('USD'),
  pipelineId:  z.string().min(1, 'Pipeline is required'),
  stageId:     z.string().min(1, 'Stage is required'),
  contactId:   z.string().optional(),
  companyId:   z.string().optional(),
  closingDate: z.string().optional(),
  description: z.string().optional(),
  tags:        z.array(z.string()).default([]),
});

export const UpdateDealSchema = CreateDealSchema.partial();

export const MoveDealStageSchema = z.object({
  stageId:    z.string().min(1, 'Stage is required'),
  lostReason: z.string().optional(),
});

export const DealFilterSchema = z.object({
  search:     z.string().default(''),
  page:       z.coerce.number().min(1).default(1),
  limit:      z.coerce.number().min(1).max(100).default(20),
  status:     z.enum(['OPEN', 'WON', 'LOST', 'ON_HOLD']).optional(),
  pipelineId: z.string().optional(),
  stageId:    z.string().optional(),
  ownerId:    z.string().optional(),
});

export type CreateDealFormData = z.infer<typeof CreateDealSchema>;
export type UpdateDealFormData = z.infer<typeof UpdateDealSchema>;
export type MoveDealStageFormData = z.infer<typeof MoveDealStageSchema>;
export type DealFilterFormData = z.infer<typeof DealFilterSchema>;
