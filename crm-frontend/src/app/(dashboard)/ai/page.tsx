'use client';

import { useState, useRef, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Brain, Search, ShieldCheck, Send, Loader2, AlertCircle, CheckCircle2, XCircle, Sparkles } from 'lucide-react';
import { aiApi, RagQueryResult, SemanticSearchResult, DealVerifyResult } from '@/lib/api/ai.api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'chat' | 'search' | 'verify';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: RagQueryResult['sources'];
}

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

// ─── Tab: Ask AI (RAG Chat) ────────────────────────────────────────────────────

function ChatTab() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: "Hi! I'm your AI Copilot. Ask me anything about your CRM data — leads, deals, contacts, support tickets, and more.",
    },
  ]);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const { mutate, isPending } = useMutation({
    mutationFn: (query: string) => aiApi.query(query),
    onSuccess: (data) => {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.answer, sources: data.sources },
      ]);
    },
    onError: () => {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' },
      ]);
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isPending]);

  function handleSend() {
    const q = input.trim();
    if (!q || isPending) return;
    setMessages((prev) => [...prev, { role: 'user', content: q }]);
    setInput('');
    mutate(q);
  }

  const suggestions = [
    'What are the top deals closing this month?',
    'Summarize open support tickets',
    'Which leads need follow-up?',
    'What is customer sentiment around pricing?',
  ];

  return (
    <div className="flex h-[calc(100vh-220px)] flex-col gap-3">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white">
                <Sparkles size={14} />
              </div>
            )}
            <div className={`max-w-[75%] space-y-2 ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col`}>
              <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-canvas border border-ui-border text-fg'
              }`}>
                {msg.content}
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
        {isPending && (
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

      {/* Suggestions (only when just the greeting is shown) */}
      {messages.length === 1 && (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => { setInput(s); }}
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
          disabled={isPending}
          className="flex-1"
        />
        <Button onClick={handleSend} disabled={!input.trim() || isPending} size="icon">
          {isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </Button>
      </div>
    </div>
  );
}

// ─── Tab: Semantic Search ──────────────────────────────────────────────────────

function SearchTab() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SemanticSearchResult['results'] | null>(null);
  const [entityTypes, setEntityTypes] = useState<string[]>(['activity', 'communication', 'ticket']);

  const { mutate, isPending, isError } = useMutation({
    mutationFn: () => aiApi.search(query, entityTypes),
    onSuccess: (data) => setResults(data.results),
  });

  function toggleType(type: string) {
    setEntityTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && query.trim() && mutate()}
              placeholder="e.g. customer complained about billing delay…"
              className="flex-1"
            />
            <Button onClick={() => mutate()} disabled={!query.trim() || isPending}>
              {isPending ? <Loader2 size={16} className="animate-spin mr-2" /> : <Search size={16} className="mr-2" />}
              Search
            </Button>
          </div>
          <div className="flex gap-2">
            <span className="text-xs text-fg-muted self-center">Filter:</span>
            {['activity', 'communication', 'ticket'].map((type) => (
              <button
                key={type}
                onClick={() => toggleType(type)}
                className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
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

      {isError && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          <AlertCircle size={16} /> Search failed. Please try again.
        </div>
      )}

      {results !== null && (
        <div className="space-y-2">
          <p className="text-sm text-fg-muted">{results.length} result{results.length !== 1 ? 's' : ''} found</p>
          {results.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-fg-muted">
                No matching records found. Try a different query.
              </CardContent>
            </Card>
          ) : (
            results.map((r, i) => (
              <Card key={i}>
                <CardContent className="py-3 px-4 flex items-start gap-3">
                  <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-xs font-medium capitalize ${ENTITY_COLORS[r.entityType] ?? 'bg-canvas-subtle text-fg-muted'}`}>
                    {r.entityType}
                  </span>
                  <p className="flex-1 text-sm text-fg-secondary">{r.snippet}</p>
                  <span className="shrink-0 text-xs text-fg-subtle">{Math.round(r.score * 100)}% match</span>
                </CardContent>
              </Card>
            ))
          )}
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
            <CardContent className="text-sm text-fg-secondary leading-relaxed">
              {result.answer}
            </CardContent>
          </Card>

          {/* Sources */}
          {result.sources.length > 0 && (
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
          <p className="text-xs text-fg-muted">Powered by GPT-4o + pgvector RAG + Blockchain verification</p>
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
