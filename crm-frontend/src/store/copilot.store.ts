import { create } from 'zustand';
import axios from 'axios';
import { apiPost } from '@/lib/api/client';

export interface CopilotSource {
  id: string;
  entityType: string;
  snippet: string;
  score: number;
}

export interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: CopilotSource[];
  timestamp: number;
}

export interface CopilotContext {
  page?: string;
  entityId?: string;
}

interface CopilotState {
  messages: CopilotMessage[];
  isLoading: boolean;
  sessionId: string;
  context: CopilotContext;
  setContext: (ctx: CopilotContext) => void;
  sendMessage: (query: string) => Promise<void>;
  clearMessages: () => void;
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

const GREETING: CopilotMessage = {
  id: 'init',
  role: 'assistant',
  content:
    "Hi! I'm your AI Copilot. Ask me anything — analyze deals, find contacts, create follow-up tasks, or query your CRM data in plain English.",
  timestamp: 0,
};

export const useCopilotStore = create<CopilotState>((set, get) => ({
  messages: [GREETING],
  isLoading: false,
  sessionId: makeId(),
  context: {},

  setContext: (ctx) => set({ context: ctx }),

  clearMessages: () =>
    set({ messages: [{ ...GREETING, timestamp: Date.now() }], sessionId: makeId() }),

  sendMessage: async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed || get().isLoading) return;

    const userMsg: CopilotMessage = {
      id: makeId(),
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    };

    set((s) => ({ messages: [...s.messages, userMsg], isLoading: true }));

    try {
      const { sessionId, context } = get();

      // Raw shape the backend actually returns (RagSource field names)
      type RawSource = {
        entityType: string;
        entityId: string;
        similarity: number;
        excerpt: string;
      };
      const res = await apiPost<{ answer: string; sources?: RawSource[] }>(
        '/ai/copilot',
        { query: trimmed, context, sessionId },
        { timeout: 120_000 }, // AI responses can take 20-60 s — override the 30 s global default
      );

      // Map backend field names → frontend CopilotSource interface
      const sources: CopilotSource[] = (res.sources ?? []).map((s) => ({
        id:         s.entityId,
        entityType: s.entityType,
        snippet:    s.excerpt,
        score:      s.similarity,
      }));

      const assistantMsg: CopilotMessage = {
        id: makeId(),
        role: 'assistant',
        content: res.answer,
        sources,
        timestamp: Date.now(),
      };

      set((s) => ({ messages: [...s.messages, assistantMsg], isLoading: false }));
    } catch (err) {
      console.error('[CopilotStore] sendMessage failed:', err);

      let content = 'Sorry, something went wrong. Please try again.';

      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const isTimeout = err.code === 'ECONNABORTED' || err.message?.includes('timeout');
        if (isTimeout) {
          content = 'The AI is taking longer than expected. Please wait a moment and try again — avoid resending while a response is in progress.';
        } else if (status === 429) {
          const retryAfter = err.response?.headers?.['retry-after'];
          const waitSecs = retryAfter ? parseInt(retryAfter, 10) : 60;
          content = `You've sent too many messages. Please wait ${waitSecs} second${waitSecs !== 1 ? 's' : ''} before trying again.`;
        } else if (status === 401) {
          content = 'Your session has expired. Please refresh the page and log in again.';
        } else if (status === 403) {
          content = "You don't have permission to use the AI Copilot.";
        } else if (status && status >= 500) {
          content = 'The AI service is temporarily unavailable. Please try again in a moment.';
        }
      }

      const errorMsg: CopilotMessage = {
        id: makeId(),
        role: 'assistant',
        content,
        timestamp: Date.now(),
      };
      set((s) => ({ messages: [...s.messages, errorMsg], isLoading: false }));
    }
  },
}));
