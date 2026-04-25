'use client';

import { useRef, useEffect, useState } from 'react';
import { Send, Loader2, Sparkles, ExternalLink, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useCopilotStore, CopilotMessage, CopilotSource } from '@/store/copilot.store';
import { AIResponseRenderer } from '@/components/ai/ai-response-renderer';
import { cn } from '@/lib/utils';

const TOOL_STATUSES = [
  '🔍 Searching CRM...',
  '📊 Analyzing data...',
  '🤖 Processing with AI...',
  '⚡ Fetching records...',
  '✅ Almost done...',
];

const SUGGESTED_PROMPTS = [
  'Analyze my top deals this month',
  'Which contacts need follow-up?',
  'Summarize recent support tickets',
  'What leads are going cold?',
];

interface CopilotPanelProps {
  /** Compact mode for the floating widget — smaller sources, shows "open full" button */
  compact?: boolean;
  onOpenFull?: () => void;
}

export function CopilotPanel({ compact = false, onOpenFull }: CopilotPanelProps) {
  const { messages, isLoading, sendMessage, clearMessages } = useCopilotStore();
  const [input, setInput] = useState('');
  const [toolIdx, setToolIdx] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Cycle through tool status labels while the AI is working
  useEffect(() => {
    if (!isLoading) { setToolIdx(0); return; }
    const t = setInterval(() => setToolIdx((i) => (i + 1) % TOOL_STATUSES.length), 1800);
    return () => clearInterval(t);
  }, [isLoading]);

  function handleSend() {
    const q = input.trim();
    if (!q || isLoading) return;
    setInput('');
    sendMessage(q);
  }

  function handleOpenFull() {
    onOpenFull?.();
    router.push('/ai');
  }

  const showSuggestions = messages.length === 1 && !isLoading;

  return (
    <div className="flex flex-col h-full bg-canvas">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-ui-border shrink-0">
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.span
              key={TOOL_STATUSES[toolIdx]}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="text-xs font-medium text-blue-500"
            >
              {TOOL_STATUSES[toolIdx]}
            </motion.span>
          ) : (
            <motion.span
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xs font-medium text-fg-muted uppercase tracking-wide"
            >
              AI Copilot
            </motion.span>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-1">
          {messages.length > 1 && (
            <button
              onClick={clearMessages}
              title="Clear conversation"
              className="p-1 rounded text-fg-subtle hover:text-fg-secondary hover:bg-canvas-subtle transition-colors"
            >
              <Trash2 size={12} />
            </button>
          )}
          {compact && (
            <button
              onClick={handleOpenFull}
              title="Open full Copilot"
              className="p-1 rounded text-fg-subtle hover:text-fg-secondary hover:bg-canvas-subtle transition-colors"
            >
              <ExternalLink size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} compact={compact} />
        ))}

        {/* Typing indicator */}
        <AnimatePresence>
          {isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
                <Sparkles size={12} />
              </div>
              <div className="flex items-center gap-1 rounded-2xl border border-ui-border bg-canvas px-3 py-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce [animation-delay:300ms]" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={bottomRef} />
      </div>

      {/* Suggested prompts — only on fresh conversation */}
      <AnimatePresence>
        {showSuggestions && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="px-4 pb-2 flex flex-wrap gap-1.5 shrink-0"
          >
            {SUGGESTED_PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => { setInput(p); inputRef.current?.focus(); }}
                className="rounded-full border border-ui-border bg-canvas px-2.5 py-1 text-[11px] text-fg-secondary hover:border-blue-300 hover:text-blue-600 transition-colors"
              >
                {p}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input */}
      <div className="px-4 pb-4 pt-2 shrink-0">
        <div
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg',
            'bg-canvas-subtle border border-ui-border',
            'focus-within:border-blue-400 focus-within:bg-canvas transition-colors duration-150',
          )}
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder={compact ? 'Ask anything…' : 'Ask anything about your CRM data…'}
            disabled={isLoading}
            className="flex-1 bg-transparent text-[13px] text-fg placeholder:text-fg-subtle outline-none disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className={cn(
              'p-1.5 rounded-md transition-all duration-150',
              'bg-blue-600 text-white hover:bg-blue-500',
              'disabled:opacity-40 disabled:cursor-not-allowed',
            )}
          >
            {isLoading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Message bubble ─────────────────────────────────────────────────────────────

function MessageBubble({ message, compact }: { message: CopilotMessage; compact: boolean }) {
  const isUser = message.role === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.18 } }}
      className={cn('flex gap-2', isUser ? 'justify-end' : 'justify-start')}
    >
      {!isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white mt-0.5">
          <Sparkles size={12} />
        </div>
      )}

      <div
        className={cn(
          'flex flex-col gap-1.5',
          isUser ? 'items-end' : 'items-start',
          compact ? 'max-w-[85%]' : 'max-w-[78%]',
        )}
      >
        <div
          className={cn(
            'rounded-2xl px-3 py-2 text-sm leading-relaxed',
            isUser
              ? 'bg-blue-600 text-white rounded-tr-sm'
              : 'bg-canvas border border-ui-border text-fg rounded-tl-sm',
          )}
        >
          {isUser ? (
            message.content
          ) : (
            <AIResponseRenderer content={message.content} variant="compact" />
          )}
        </div>

        {/* Sources */}
        {!isUser && message.sources && message.sources.length > 0 && (
          <SourceList sources={message.sources} compact={compact} />
        )}
      </div>
    </motion.div>
  );
}


const ENTITY_COLOR: Record<string, string> = {
  activity:      'bg-blue-100 text-blue-700',
  communication: 'bg-purple-100 text-purple-700',
  ticket:        'bg-orange-100 text-orange-700',
};

function SourceList({ sources, compact }: { sources: CopilotSource[]; compact: boolean }) {
  const visible = compact ? sources.slice(0, 2) : sources;

  return (
    <div className="w-full space-y-1">
      <p className="text-[10px] text-fg-subtle uppercase tracking-wide pl-1">Sources</p>
      {visible.map((s, i) => (
        <div
          key={i}
          className="flex items-center gap-1.5 rounded border border-ui-border bg-canvas-subtle px-2 py-1 text-[11px]"
        >
          <span
            className={cn(
              'shrink-0 rounded px-1.5 py-0.5 font-medium capitalize',
              ENTITY_COLOR[s.entityType] ?? 'bg-canvas text-fg-muted',
            )}
          >
            {s.entityType}
          </span>
          <span className="line-clamp-1 flex-1 text-fg-secondary">{s.snippet}</span>
          <span className="shrink-0 text-fg-subtle">{Math.round(s.score * 100)}%</span>
        </div>
      ))}
      {compact && sources.length > 2 && (
        <p className="text-[10px] text-fg-subtle pl-1">+{sources.length - 2} more</p>
      )}
    </div>
  );
}
