'use client';

import { useState, useRef, useTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Send, Loader2, Sparkles, ChevronDown, X } from 'lucide-react';
import { apiPost } from '@/lib/api/client';
import { useAuthStore } from '@/store/auth.store';
import { cn } from '@/lib/utils';

type OperationType =
  | 'summarize_contact'
  | 'suggest_follow_up'
  | 'summarize_activity'
  | 'generate_email_reply';

interface Op {
  key:         OperationType;
  label:       string;
  placeholder: string;
  description: string;
}

const OPERATIONS: Op[] = [
  {
    key:         'summarize_contact',
    label:       'Summarize Contact',
    placeholder: 'Enter contact ID…',
    description: 'Generate a structured summary of all interactions.',
  },
  {
    key:         'suggest_follow_up',
    label:       'Suggest Follow-up',
    placeholder: 'entityType + ID, e.g. "deal abc123"',
    description: 'Best next action for a CRM entity based on history.',
  },
  {
    key:         'summarize_activity',
    label:       'Activity Timeline',
    placeholder: 'entityType + entityId, e.g. "deal abc123"',
    description: "Compact narrative of an entity's activity timeline.",
  },
  {
    key:         'generate_email_reply',
    label:       'Draft Email Reply',
    placeholder: 'Enter communication ID…',
    description: 'AI-drafted reply to an inbound email.',
  },
];

const opEndpoints: Record<OperationType, string> = {
  summarize_contact:    '/ai/summarize-contact',
  suggest_follow_up:    '/ai/suggest-follow-up',
  summarize_activity:   '/ai/summarize-activity',
  generate_email_reply: '/ai/generate-email-reply',
};

interface AiResponse {
  summary?: string;
  keyPoints?: string[];
  sentiment?: string;
  action?: string;
  reasoning?: string;
  urgency?: string;
  suggestedChannel?: string;
  lastActivity?: string;
  nextStep?: string;
  subject?: string;
  body?: string;
  tone?: string;
}

// ── Response renderer ─────────────────────────────────────────────────────────

function ResponseBlock({ data, op }: { data: AiResponse; op: OperationType }) {
  if (op === 'summarize_contact') {
    return (
      <div className="space-y-3">
        {data.summary && (
          <p className="text-sm text-fg-secondary leading-relaxed">{data.summary}</p>
        )}
        {data.keyPoints?.length ? (
          <ul className="space-y-1.5">
            {data.keyPoints.map((pt, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-fg-secondary">
                <span className="mt-2 w-1 h-1 rounded-full bg-blue-500 shrink-0" />
                {pt}
              </li>
            ))}
          </ul>
        ) : null}
        {data.sentiment && (
          <span className={cn(
            'inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold uppercase tracking-wide',
            data.sentiment === 'positive' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' :
            data.sentiment === 'negative' ? 'bg-rose-50 text-rose-600 border border-rose-200' :
            'bg-canvas-subtle text-fg-muted border border-ui-border',
          )}>
            {data.sentiment}
          </span>
        )}
      </div>
    );
  }

  if (op === 'suggest_follow_up') {
    return (
      <div className="space-y-2">
        {data.action    && <p className="text-sm font-semibold text-fg">{data.action}</p>}
        {data.reasoning && <p className="text-sm text-fg-secondary leading-relaxed">{data.reasoning}</p>}
        <div className="flex flex-wrap gap-2 pt-1">
          {data.urgency && (
            <span className={cn(
              'inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold uppercase tracking-wide',
              data.urgency === 'high'   ? 'bg-rose-50 text-rose-600 border border-rose-200' :
              data.urgency === 'medium' ? 'bg-amber-50 text-amber-600 border border-amber-200' :
              'bg-canvas-subtle text-fg-muted border border-ui-border',
            )}>
              {data.urgency} urgency
            </span>
          )}
          {data.suggestedChannel && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold uppercase tracking-wide bg-blue-50 text-blue-600 border border-blue-200">
              {data.suggestedChannel}
            </span>
          )}
        </div>
      </div>
    );
  }

  if (op === 'summarize_activity') {
    return (
      <div className="space-y-2">
        {data.summary      && <p className="text-sm text-gray-700 leading-relaxed">{data.summary}</p>}
        {data.lastActivity && <p className="text-xs text-fg-subtle">Last: {data.lastActivity}</p>}
        {data.nextStep && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mt-2">
            <p className="text-xs font-semibold text-blue-600 mb-0.5">Next step</p>
            <p className="text-sm text-fg-secondary">{data.nextStep}</p>
          </div>
        )}
      </div>
    );
  }

  if (op === 'generate_email_reply') {
    return (
      <div className="space-y-3">
        {data.subject && (
          <div>
            <p className="text-[11px] text-fg-subtle uppercase tracking-wide mb-1">Subject</p>
            <p className="text-sm font-semibold text-fg">{data.subject}</p>
          </div>
        )}
        {data.body && (
          <div>
            <p className="text-[11px] text-fg-subtle uppercase tracking-wide mb-1">Body</p>
            <p className="text-sm text-fg-secondary leading-relaxed whitespace-pre-line">{data.body}</p>
          </div>
        )}
        {data.tone && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold uppercase tracking-wide bg-emerald-50 text-emerald-600 border border-emerald-200">
            {data.tone}
          </span>
        )}
      </div>
    );
  }

  return <pre className="text-xs text-fg-muted whitespace-pre-wrap">{JSON.stringify(data, null, 2)}</pre>;
}

// ── Core widget panel ─────────────────────────────────────────────────────────

export function AiCopilotWidget() {
  const user                        = useAuthStore((s) => s.user);
  const [activeOp, setActiveOp]     = useState<OperationType>('summarize_contact');
  const [input, setInput]           = useState('');
  const [result, setResult]         = useState<AiResponse | null>(null);
  const [error, setError]           = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [opOpen, setOpOpen]         = useState(false);
  const inputRef                    = useRef<HTMLInputElement>(null);

  const currentOp = OPERATIONS.find((o) => o.key === activeOp)!;

  function buildPayload(op: OperationType, raw: string) {
    const trimmed = raw.trim();
    if (op === 'summarize_contact')    return { contactId: trimmed };
    if (op === 'generate_email_reply') return { communicationId: trimmed };
    const [entityType, entityId] = trimmed.split(/\s+/);
    return { entityType: entityType ?? 'lead', entityId: entityId ?? trimmed };
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isPending) return;
    setResult(null);
    setError(null);
    startTransition(async () => {
      try {
        const tenantId = user?.tenantId ?? '';
        const payload  = { tenantId, ...buildPayload(activeOp, input) };
        const res      = await apiPost<AiResponse>(opEndpoints[activeOp], payload);
        setResult(res);
      } catch (err) {
        setError((err as Error).message ?? 'AI request failed');
      }
    });
  }

  return (
    <div className="bg-canvas border border-ui-border rounded-xl flex flex-col h-full shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-ui-border">
        <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
          <Brain size={15} strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-fg leading-none">AI Copilot</p>
          <p className="text-[11px] text-fg-subtle mt-0.5">Powered by GPT-4o</p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[11px] text-fg-subtle">Ready</span>
        </div>
      </div>

      {/* Operation selector */}
      <div className="px-5 py-3">
        <div className="relative">
          <button
            onClick={() => setOpOpen((o) => !o)}
            className={cn(
              'w-full flex items-center justify-between px-3 py-2.5 rounded-lg',
              'bg-canvas-subtle border border-ui-border hover:border-ui-border',
              'transition-colors duration-150 text-left',
            )}
          >
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-fg">{currentOp.label}</p>
              <p className="text-[11px] text-fg-subtle mt-0.5 truncate">{currentOp.description}</p>
            </div>
            <ChevronDown
              size={14}
              className={cn('text-fg-subtle transition-transform duration-200 shrink-0 ml-3', opOpen && 'rotate-180')}
            />
          </button>

          <AnimatePresence>
            {opOpen && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.13 } }}
                exit={{ opacity: 0, y: -4, transition: { duration: 0.10 } }}
                className="absolute left-0 right-0 top-[calc(100%+4px)] bg-canvas border border-ui-border rounded-xl overflow-hidden z-20 shadow-lg"
              >
                {OPERATIONS.map((op) => (
                  <button
                    key={op.key}
                    onClick={() => { setActiveOp(op.key); setOpOpen(false); setResult(null); setInput(''); }}
                    className={cn(
                      'w-full flex items-start gap-2.5 px-3 py-2.5 text-left',
                      'hover:bg-canvas-subtle transition-colors duration-100',
                      op.key === activeOp && 'bg-blue-50',
                    )}
                  >
                    {op.key === activeOp && (
                      <span className="mt-2 w-1 h-1 rounded-full bg-blue-500 shrink-0" />
                    )}
                    <div>
                      <p className="text-[13px] font-medium text-gray-900">{op.label}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{op.description}</p>
                    </div>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="px-5 pb-4">
        <div className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg',
          'bg-canvas-subtle border border-ui-border',
          'focus-within:border-blue-400 focus-within:bg-canvas',
          'transition-colors duration-150',
        )}>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={currentOp.placeholder}
            disabled={isPending}
            className="flex-1 bg-transparent text-[13px] text-fg placeholder:text-fg-subtle outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || isPending}
            className={cn(
              'p-1.5 rounded-md transition-all duration-150',
              'bg-blue-600 text-white',
              'hover:bg-blue-500',
              'disabled:opacity-40 disabled:cursor-not-allowed',
            )}
          >
            {isPending
              ? <Loader2 size={13} className="animate-spin" />
              : <Send size={13} />
            }
          </button>
        </div>
      </form>

      {/* Divider */}
      <div className="h-px bg-ui-border mx-5" />

      {/* Response area */}
      <div className="flex-1 overflow-y-auto px-5 py-4 min-h-[160px]">
        <AnimatePresence mode="wait">
          {isPending ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center h-full gap-2.5 py-8"
            >
              <Loader2 size={20} className="text-blue-500 animate-spin" />
              <p className="text-xs text-fg-subtle">Generating response…</p>
            </motion.div>
          ) : error ? (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 border border-rose-200"
            >
              <span className="text-rose-500 mt-0.5">⚠</span>
              <p className="text-sm text-rose-600">{error}</p>
            </motion.div>
          ) : result ? (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0, transition: { duration: 0.25 } }}
              exit={{ opacity: 0 }}
            >
              <div className="flex items-center gap-1.5 mb-3">
                <Sparkles size={12} className="text-blue-500" />
                <span className="text-[11px] font-semibold text-blue-500 uppercase tracking-wider">
                  AI Response
                </span>
              </div>
              <ResponseBlock data={result} op={activeOp} />
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-full gap-2 py-10 text-center"
            >
              <Brain size={26} className="text-fg-subtle" strokeWidth={1.2} />
              <p className="text-sm text-fg-muted">Select an operation and enter an ID</p>
              <p className="text-[11px] text-fg-subtle">AI will analyze your CRM data</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Floating widget wrapper ───────────────────────────────────────────────────

export function FloatingAiCopilot() {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0, transition: { duration: 0.2 } }}
            exit={{ opacity: 0, scale: 0.95, y: 8, transition: { duration: 0.15 } }}
            className="w-80 h-[500px] shadow-2xl rounded-xl overflow-hidden"
          >
            <AiCopilotWidget />
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        onClick={() => setOpen((o) => !o)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className={cn(
          'w-12 h-12 rounded-full shadow-lg flex items-center justify-center',
          'transition-colors duration-200',
          open
            ? 'bg-gray-700 hover:bg-gray-600 text-white'
            : 'bg-blue-600 hover:bg-blue-500 text-white',
        )}
        aria-label={open ? 'Close AI Copilot' : 'Open AI Copilot'}
      >
        {open ? <X size={18} /> : <Brain size={18} />}
      </motion.button>
    </div>
  );
}
