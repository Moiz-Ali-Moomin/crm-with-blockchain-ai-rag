import { z } from 'zod';

// ── Semantic Search ────────────────────────────────────────────────────────────

export const SemanticSearchSchema = z.object({
  query: z.string().min(1).max(500),
  entityTypes: z
    .array(z.enum(['activity', 'communication', 'ticket']))
    .optional()
    .default(['activity', 'communication', 'ticket']),
  limit: z.coerce.number().int().min(1).max(20).default(10),
  threshold: z.coerce.number().min(0).max(1).default(0.72),
});
export type SemanticSearchDto = z.infer<typeof SemanticSearchSchema>;

// ── Summarise Customer History ─────────────────────────────────────────────────

export const SummarizeContactSchema = z.object({
  contactId: z.string().uuid(),
  /** Max number of recent records to include in context window */
  contextLimit: z.coerce.number().int().min(5).max(50).default(20),
});
export type SummarizeContactDto = z.infer<typeof SummarizeContactSchema>;

// ── Generate Email Reply ───────────────────────────────────────────────────────

export const GenerateEmailReplySchema = z.object({
  communicationId: z.string().uuid(),
  /** Optional: override instruction for tone / goal */
  instruction: z.string().max(300).optional(),
});
export type GenerateEmailReplyDto = z.infer<typeof GenerateEmailReplySchema>;

// ── Suggest Follow-Up ─────────────────────────────────────────────────────────

export const SuggestFollowUpSchema = z.object({
  entityType: z.enum(['lead', 'contact', 'deal']),
  entityId: z.string().uuid(),
});
export type SuggestFollowUpDto = z.infer<typeof SuggestFollowUpSchema>;

// ── Summarize Activity Timeline ────────────────────────────────────────────────

export const SummarizeActivitySchema = z.object({
  entityType: z.enum(['lead', 'contact', 'deal', 'ticket']),
  entityId: z.string().uuid(),
  contextLimit: z.coerce.number().int().min(3).max(30).default(15),
});
export type SummarizeActivityDto = z.infer<typeof SummarizeActivitySchema>;

// ── Internal: Embedding Job Payload (enqueued by other services) ───────────────

export interface EmbeddingJobPayload {
  tenantId: string;
  entityType: string;
  entityId: string;
  /**
   * 'upsert' (default): generate + store embedding.
   * 'delete': remove the embedding row when the source entity is deleted.
   */
  action?: 'upsert' | 'delete';
  /** The raw text to embed — required for 'upsert', omitted for 'delete'. */
  content?: string;
  /** Extra metadata stored alongside the embedding for retrieval context */
  metadata?: Record<string, unknown>;
}

// ── RAG Query ──────────────────────────────────────────────────────────────────

const ChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(4000),
});

export const RagQuerySchema = z.object({
  query: z.string().min(1).max(800),
  entityTypes: z
    .array(z.enum(['activity', 'communication', 'ticket']))
    .optional()
    .default(['activity', 'communication', 'ticket']),
  topK: z.coerce.number().int().min(1).max(20).default(8),
  threshold: z.coerce.number().min(0).max(1).default(0.72),
  history: z.array(ChatMessageSchema).max(20).optional().default([]),
  /** Opaque session ID (UUID) for persistent multi-turn agent memory */
  sessionId: z.string().uuid().optional(),
});
export type RagQueryDto = z.infer<typeof RagQuerySchema>;

// ── Verify Deal with AI (RAG + Blockchain combined) ────────────────────────────

export const VerifyDealWithAiSchema = z.object({
  dealId: z.string().uuid(),
  /** Optional extra question appended to the verification context */
  additionalContext: z.string().max(500).optional(),
});
export type VerifyDealWithAiDto = z.infer<typeof VerifyDealWithAiSchema>;

// ── Unified Conversational Copilot ────────────────────────────────────────────

const CopilotContextSchema = z.object({
  page: z.string().optional(),
  entityId: z.string().optional(),
});

export const CopilotQuerySchema = z.object({
  query: z.string().min(1).max(800),
  context: CopilotContextSchema.optional(),
  sessionId: z.string().uuid().optional(),
  history: z.array(ChatMessageSchema).max(20).optional().default([]),
});
export type CopilotQueryDto = z.infer<typeof CopilotQuerySchema>;
