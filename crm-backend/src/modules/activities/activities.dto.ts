import { z } from 'zod';
import { PaginationSchema } from '../../common/dto/pagination.dto';

const ActivityTypeEnum = z.enum([
  'CALL',
  'EMAIL',
  'MEETING',
  'NOTE',
  'TASK',
  'SMS',
  'WHATSAPP',
]);

const EntityTypeEnum = z.enum([
  'LEAD',
  'CONTACT',
  'COMPANY',
  'DEAL',
  'TICKET',
]);

export const CreateActivitySchema = z.object({
  type: ActivityTypeEnum,
  entityType: EntityTypeEnum,
  entityId: z.string().min(1),
  subject: z.string().min(1).max(500),
  body: z.string().optional(),
  duration: z.number().int().nonnegative().optional(), // minutes
  outcome: z.string().max(255).optional(),
  scheduledAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
});

export const UpdateActivitySchema = CreateActivitySchema.partial();

export const FilterActivitySchema = PaginationSchema.extend({
  entityType: z.preprocess((v) => (v === '' ? undefined : v), EntityTypeEnum.optional()),
  entityId: z.string().optional(),
  type: z.preprocess((v) => (v === '' ? undefined : v), ActivityTypeEnum.optional()),
  createdById: z.preprocess((v) => (v === '' ? undefined : v), z.string().uuid().optional()),
  dateFrom: z.preprocess((v) => (v === '' ? undefined : v), z.string().datetime().optional()),
  dateTo: z.preprocess((v) => (v === '' ? undefined : v), z.string().datetime().optional()),
});

export const TimelineQuerySchema = z.object({
  entityType: EntityTypeEnum,
  entityId: z.string().min(1),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateActivityDto = z.infer<typeof CreateActivitySchema>;
export type UpdateActivityDto = z.infer<typeof UpdateActivitySchema>;
export type FilterActivityDto = z.infer<typeof FilterActivitySchema>;
export type TimelineQueryDto = z.infer<typeof TimelineQuerySchema>;
