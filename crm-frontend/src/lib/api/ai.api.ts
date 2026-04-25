import { apiPost, apiGet } from './client';

export interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface RagQueryResult {
  answer: string;
  sources: { id: string; entityType: string; snippet: string; score: number }[];
  tokensUsed?: number;
}

export interface SemanticSearchHit {
  id: string;
  entityType: string;
  snippet: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface SemanticSearchResult {
  results: SemanticSearchHit[];
  answer?: string; // AI-generated summary returned alongside the raw hits
}

export interface DealVerifyResult {
  answer: string;
  blockchain: { verified: boolean; txHash?: string; network?: string; registeredAt?: string } | null;
  sources: { id: string; entityType: string; snippet: string; score: number }[];
}

export const aiApi = {
  query: (query: string, history?: ChatHistoryMessage[]) =>
    apiPost<RagQueryResult>('/ai/query', { query, history: history ?? [] }),

  search: (query: string, entityTypes?: string[]) =>
    apiPost<SemanticSearchResult>('/ai/search', { query, entityTypes }),

  verifyDeal: (dealId: string, additionalContext?: string) =>
    apiPost<DealVerifyResult>('/ai/deals/verify', { dealId, additionalContext }),

  suggestFollowUp: (entityType: 'lead' | 'contact' | 'deal', entityId: string) =>
    apiPost<{ suggestion: string }>('/ai/follow-up', { entityType, entityId }),

  summarizeContact: (contactId: string) =>
    apiGet<{ summary: string }>('/ai/contact/summary', { contactId }),
};
