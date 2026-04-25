import { create } from 'zustand';
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
      const res = await apiPost<{ answer: string; sources?: CopilotSource[] }>(
        '/ai/copilot',
        { query: trimmed, context, sessionId },
      );

      const assistantMsg: CopilotMessage = {
        id: makeId(),
        role: 'assistant',
        content: res.answer,
        sources: res.sources ?? [],
        timestamp: Date.now(),
      };

      set((s) => ({ messages: [...s.messages, assistantMsg], isLoading: false }));
    } catch {
      const errorMsg: CopilotMessage = {
        id: makeId(),
        role: 'assistant',
        content: 'Sorry, something went wrong. Please try again.',
        timestamp: Date.now(),
      };
      set((s) => ({ messages: [...s.messages, errorMsg], isLoading: false }));
    }
  },
}));
