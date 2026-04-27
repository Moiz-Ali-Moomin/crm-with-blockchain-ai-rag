/**
 * llm.interface.ts — Core LLM provider contract
 *
 * All LLM implementations (Anthropic, OpenAI, …) must implement LLMProvider.
 * Consumers depend on this interface via the LLM_PROVIDER injection token —
 * the concrete class is never visible outside of ai.module.ts and the factory.
 *
 * Design:
 *   - Single `generate()` method keeps the API surface tiny.
 *   - `system` and `context` are optional so the interface stays flexible:
 *     RAG passes both; CopilotService passes only `system`.
 *   - `context` is RAG-retrieved text injected before the user's question.
 */

/** A single turn in a conversation */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Input shape for a single LLM call */
export interface LLMInput {
  /** Static system instruction (never contains user input) */
  system?: string;
  /** The main user prompt / question */
  prompt: string;
  /** Pre-retrieved context to inject (e.g. RAG results) */
  context?: string;
  /** Prior conversation turns — enables multi-turn chat */
  history?: ChatMessage[];
  /** Propagated from the HTTP request — cancels the in-flight API call on client disconnect */
  signal?: AbortSignal;
}

/** Contract every LLM provider must satisfy */
export interface LLMProvider {
  generate(input: LLMInput): Promise<string>;
}

/** NestJS DI injection token */
export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

// ── Agent tool-calling types ──────────────────────────────────────────────────

export interface AgentTextBlock {
  type: 'text';
  text: string;
}

export interface AgentToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export type AgentContentBlock = AgentTextBlock | AgentToolUseBlock;

export interface AgentToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
}

export interface AgentUserMessage {
  role: 'user';
  content: string | AgentToolResultBlock[];
}

export interface AgentAssistantMessage {
  role: 'assistant';
  content: AgentContentBlock[];
}

export type AgentConversationMessage = AgentUserMessage | AgentAssistantMessage;

export interface AgentToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface AgentLLMInput {
  system?: string;
  messages: AgentConversationMessage[];
  tools: AgentToolDefinition[];
  maxTokens?: number;
}

export interface AgentLLMResponse {
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence';
  content: AgentContentBlock[];
  usage: { inputTokens: number; outputTokens: number };
}

/** Extended provider contract for agentic (tool-calling) loops */
export interface AgentCapableLLMProvider extends LLMProvider {
  generateWithTools(input: AgentLLMInput): Promise<AgentLLMResponse>;
}
