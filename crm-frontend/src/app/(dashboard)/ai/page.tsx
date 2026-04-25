'use client';

import { useState, useRef, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Brain, Search, ShieldCheck, Send, Loader2, AlertCircle, CheckCircle2, XCircle, Sparkles, Trash2 } from 'lucide-react';
import { aiApi, SemanticSearchHit, SemanticSearchResult, DealVerifyResult } from '@/lib/api/ai.api';
import { AIResponseRenderer } from '@/components/ai/ai-response-renderer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useCopilotStore } from '@/store/copilot.store';

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'chat' | 'search' | 'verify';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ENTITY_COLORS: Record<string, string> = {
  activity:      'bg-blue-100 text-blue-700',
  communication: 'bg-purple-100 text-purple-700',
  ticket:        'bg-orange-100 text-orange-700',
};

function SourceChip({ entityType, snippet, score }: { entityType: string; snippet: string; score: number }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-ui-border bg-canvas-subtle p-2 text-xs">
      <span className={`shrink-0 rounded px-1.5 py-0.5 font-medium capitalize ${ENTITY_COLORS[entityType] ?? 'bg-canvas text-fg-muted'}`}>
        {entityType}
      </span>
      <span className="line-clamp-2 flex-1 text-fg-secondary">{snippet}</span>
      <span className="shrink-0 text-fg-subtle">{Math.round(score * 100)}%</span>
    </div>
  );
}


// ─── Tab: Ask AI (Copilot Chat) ────────────────────────────────────────────────

function ChatTab() {
  const { messages, isLoading, sendMessage, clearMessages } = useCopilotStore();
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  function handleSend() {
    const q = input.trim();
    if (!q || isLoading) return;
    setInput('');
    sendMessage(q);
  }

  const suggestions = [
    'What are the top deals closing this month?',
    'Summarize open support tickets',
    'Which leads need follow-up?',
    'What is customer sentiment around pricing?',
  ];

  return (
    <div className="flex h-[calc(100vh-220px)] flex-col gap-3">
      {/* Header actions */}
      {messages.length > 1 && (
        <div className="flex justify-end">
          <button
            onClick={clearMessages}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-fg-muted hover:text-fg-secondary hover:bg-canvas-subtle transition-colors border border-ui-border"
          >
            <Trash2 size={12} /> Clear chat
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white">
                <Sparkles size={14} />
              </div>
            )}
            <div className={`max-w-[75%] space-y-2 ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col`}>
              <div className={`rounded-2xl px-4 py-2.5 text-sm ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white leading-relaxed'
                  : 'bg-canvas border border-ui-border text-fg'
              }`}>
                {msg.role === 'user'
                  ? msg.content
                  : <AIResponseRenderer content={msg.content} />}
              </div>
              {msg.sources && msg.sources.length > 0 && (
                <div className="w-full space-y-1">
                  <p className="text-xs text-fg-subtle pl-1">Sources</p>
                  {msg.sources.map((s, si) => (
                    <SourceChip key={si} entityType={s.entityType} snippet={s.snippet} score={s.score} />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white">
              <Sparkles size={14} />
            </div>
            <div className="rounded-2xl border border-ui-border bg-canvas px-4 py-3">
              <Loader2 size={16} className="animate-spin text-indigo-500" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggestions — only on fresh conversation */}
      {messages.length === 1 && (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => setInput(s)}
              className="rounded-full border border-ui-border bg-canvas px-3 py-1.5 text-xs text-fg-secondary hover:border-indigo-300 hover:text-indigo-600 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Ask anything about your CRM data…"
          disabled={isLoading}
          className="flex-1"
        />
        <Button onClick={handleSend} disabled={!input.trim() || isLoading} size="icon">
          {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </Button>
      </div>
    </div>
  );
}

// ─── Tab: Semantic Search ──────────────────────────────────────────────────────

// Tracks whether a search has been attempted so we can distinguish
// "never searched" from "searched and got zero results".
type SearchState = 'idle' | 'loading' | 'done' | 'error';

function SearchTab() {
  const [query, setQuery]           = useState('');
  const [hits, setHits]             = useState<SemanticSearchHit[]>([]);
  const [answer, setAnswer]         = useState('');
  const [searchState, setSearchState] = useState<SearchState>('idle');
  const [entityTypes, setEntityTypes] = useState<string[]>(['activity', 'communication', 'ticket']);

  // Keep a ref to cancel stale responses when the user fires a second request
  // before the first one finishes.
  const requestIdRef = useRef(0);

  function toggleType(type: string) {
    setEntityTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  }

  async function handleSearch() {
    const trimmed = query.trim();
    if (!trimmed || searchState === 'loading') return;

    // Stamp this request so a delayed earlier response can't overwrite fresh state.
    const reqId = ++requestIdRef.current;

    setSearchState('loading');
    setHits([]);
    setAnswer('');

    try {
      const data: SemanticSearchResult = await aiApi.search(trimmed, entityTypes);

      // Ignore response if a newer request has already been fired.
      if (reqId !== requestIdRef.current) return;

      // Defensively normalise — the backend may return the array directly,
      // omit the key, or include a nullable.
      setHits(Array.isArray(data?.results) ? data.results : []);
      setAnswer(typeof data?.answer === 'string' ? data.answer : '');
      setSearchState('done');
    } catch {
      if (reqId !== requestIdRef.current) return;
      setHits([]);
      setAnswer('');
      setSearchState('error');
    }
  }

  const isLoading = searchState === 'loading';
  const hasSearched = searchState === 'done' || searchState === 'error';

  return (
    <div className="space-y-4">
      {/* ── Query bar ──────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSearch();
              }}
              placeholder="e.g. customer complained about billing delay…"
              className="flex-1"
              disabled={isLoading}
            />
            <Button onClick={handleSearch} disabled={!query.trim() || isLoading}>
              {isLoading
                ? <Loader2 size={16} className="animate-spin mr-2" />
                : <Search size={16} className="mr-2" />}
              {isLoading ? 'Searching…' : 'Search'}
            </Button>
          </div>

          {/* Entity type filters */}
          <div className="flex gap-2 flex-wrap">
            <span className="text-xs text-fg-muted self-center">Filter:</span>
            {['activity', 'communication', 'ticket'].map((type) => (
              <button
                key={type}
                onClick={() => toggleType(type)}
                disabled={isLoading}
                className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors disabled:opacity-50 ${
                  entityTypes.includes(type)
                    ? ENTITY_COLORS[type]
                    : 'bg-canvas-subtle text-fg-subtle'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Loading skeleton ────────────────────────────────────────────── */}
      {isLoading && (
        <div className="flex items-center gap-3 rounded-lg border border-ui-border bg-canvas px-4 py-3 text-sm text-fg-muted">
          <Loader2 size={16} className="animate-spin text-indigo-500 shrink-0" />
          Running semantic search across your CRM data…
        </div>
      )}

      {/* ── Error state ─────────────────────────────────────────────────── */}
      {searchState === 'error' && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          <AlertCircle size={16} className="shrink-0" />
          Search failed — check your connection and try again.
        </div>
      )}

      {/* ── Results ─────────────────────────────────────────────────────── */}
      {searchState === 'done' && (
        <div className="space-y-3">

          {/* AI-generated analysis of the search results */}
          {answer.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <Sparkles size={14} className="text-indigo-500" /> AI Analysis
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-fg-secondary">
                <AIResponseRenderer content={answer} />
              </CardContent>
            </Card>
          )}

          {/* Raw hit list */}
          <div className="space-y-2">
            <p className="text-sm text-fg-muted">
              {hits.length} matching record{hits.length !== 1 ? 's' : ''} found
            </p>

            {hits.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-fg-muted">
                  No matching records found. Try a different query or broaden the entity filter.
                </CardContent>
              </Card>
            ) : (
              hits.map((r, i) => (
                <Card key={r.id ?? i}>
                  <CardContent className="py-3 px-4 flex items-start gap-3">
                    <span
                      className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-xs font-medium capitalize ${
                        ENTITY_COLORS[r.entityType] ?? 'bg-canvas-subtle text-fg-muted'
                      }`}
                    >
                      {r.entityType}
                    </span>
                    <p className="flex-1 text-sm text-fg-secondary">{r.snippet}</p>
                    <span className="shrink-0 text-xs text-fg-subtle">
                      {Math.round((r.score ?? 0) * 100)}% match
                    </span>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Deal Verify (RAG + Blockchain) ──────────────────────────────────────

function VerifyTab() {
  const [dealId, setDealId] = useState('');
  const [context, setContext] = useState('');
  const [result, setResult] = useState<DealVerifyResult | null>(null);

  const { mutate, isPending, isError } = useMutation({
    mutationFn: () => aiApi.verifyDeal(dealId.trim(), context.trim() || undefined),
    onSuccess: (data) => setResult(data),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-fg-secondary">
            Verify a deal using AI + on-chain blockchain proof
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-fg-muted">Deal ID</label>
            <Input
              value={dealId}
              onChange={(e) => setDealId(e.target.value)}
              placeholder="Paste deal UUID…"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-fg-muted">Additional context (optional)</label>
            <Input
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="e.g. Was this deal disputed by the customer?"
            />
          </div>
          <Button onClick={() => mutate()} disabled={!dealId.trim() || isPending} className="w-full">
            {isPending ? <Loader2 size={16} className="animate-spin mr-2" /> : <ShieldCheck size={16} className="mr-2" />}
            Verify Deal
          </Button>
        </CardContent>
      </Card>

      {isError && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          <AlertCircle size={16} /> Verification failed. Check the deal ID and try again.
        </div>
      )}

      {result && (
        <div className="space-y-3">
          {/* Blockchain status */}
          <Card>
            <CardContent className="py-3 px-4 flex items-center gap-3">
              {result.blockchain?.verified ? (
                <>
                  <CheckCircle2 size={20} className="text-green-500 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-green-700">On-chain proof found</p>
                    {result.blockchain.txHash && (
                      <p className="text-xs text-fg-muted font-mono mt-0.5 truncate">{result.blockchain.txHash}</p>
                    )}
                    {result.blockchain.registeredAt && (
                      <p className="text-xs text-fg-subtle mt-0.5">Registered {new Date(result.blockchain.registeredAt).toLocaleDateString()}</p>
                    )}
                  </div>
                  {result.blockchain.network && (
                    <Badge variant="secondary" className="shrink-0">{result.blockchain.network}</Badge>
                  )}
                </>
              ) : (
                <>
                  <XCircle size={20} className="text-fg-subtle shrink-0" />
                  <p className="text-sm text-fg-muted">No on-chain proof registered for this deal</p>
                </>
              )}
            </CardContent>
          </Card>

          {/* AI answer */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <Sparkles size={14} className="text-indigo-500" /> AI Analysis
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-fg-secondary">
              <AIResponseRenderer content={result.answer} />
            </CardContent>
          </Card>

          {/* Sources */}
          {(result.sources?.length ?? 0) > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-fg-subtle uppercase tracking-wide">Context sources</p>
              {result.sources.map((s, i) => (
                <SourceChip key={i} entityType={s.entityType} snippet={s.snippet} score={s.score} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'chat',   label: 'Ask AI',          icon: <Brain size={15} /> },
  { id: 'search', label: 'Semantic Search', icon: <Search size={15} /> },
  { id: 'verify', label: 'Deal Verify',     icon: <ShieldCheck size={15} /> },
];

export default function AiCopilotPage() {
  const [tab, setTab] = useState<Tab>('chat');

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white">
          <Brain size={18} />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-fg">AI Copilot</h1>
          <p className="text-xs text-fg-muted">Powered by Claude + pgvector RAG + Blockchain verification</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-canvas-subtle p-1 w-fit">
        {TABS.map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === id
                ? 'bg-canvas text-fg shadow-sm'
                : 'text-fg-muted hover:text-fg-secondary'
            }`}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'chat'   && <ChatTab />}
      {tab === 'search' && <SearchTab />}
      {tab === 'verify' && <VerifyTab />}
    </div>
  );
}
