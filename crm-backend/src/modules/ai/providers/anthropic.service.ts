/**
 * AnthropicLLMProvider — Primary LLM implementation
 *
 * Uses @anthropic-ai/sdk to call Claude Sonnet.
 * This is the PRIMARY provider; OpenAI is activated only on failure.
 *
 * Context injection:
 *   If `context` is supplied, it is prepended to the user's prompt so Claude
 *   answers with grounding information (RAG pattern).
 *
 * Configuration (via ENV):
 *   ANTHROPIC_API_KEY   — required
 *   LLM_MODEL           — optional override (default: claude-3-5-sonnet-20241022)
 *   LLM_MAX_TOKENS      — optional (default: 1024)
 *   LLM_TEMPERATURE     — optional (default: 0.2)
 */

import { Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import {
  LLMInput,
  AgentCapableLLMProvider,
  AgentLLMInput,
  AgentLLMResponse,
  AgentContentBlock,
} from './llm.interface';

interface AnthropicConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export class AnthropicLLMProvider implements AgentCapableLLMProvider {
  private readonly logger = new Logger(AnthropicLLMProvider.name);
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly temperature: number;

  constructor(config: AnthropicConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.model = config.model ?? 'claude-sonnet-4-6';
    this.maxTokens = config.maxTokens ?? 1024;
    this.temperature = config.temperature ?? 0.2;
  }

  async generate(input: LLMInput): Promise<string> {
    const userContent = input.context
      ? `Context:\n${input.context}\n\nQuestion: ${input.prompt}`
      : input.prompt;

    const history: { role: 'user' | 'assistant'; content: string }[] =
      (input.history ?? []).map((m) => ({ role: m.role, content: m.content }));

    const response = await this.client.messages.create(
      {
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        ...(input.system ? { system: input.system } : {}),
        messages: [...history, { role: 'user', content: userContent }],
      },
      input.signal ? { signal: input.signal } : undefined,
    );

    const block = response.content[0];
    if (block.type !== 'text') {
      throw new Error(`Unexpected Anthropic content block type: ${block.type}`);
    }

    this.logger.debug(`[LLM] Anthropic responded (model=${this.model}, tokens=${response.usage.output_tokens})`);
    return block.text;
  }

  async generateWithTools(input: AgentLLMInput): Promise<AgentLLMResponse> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: input.maxTokens ?? this.maxTokens,
      temperature: this.temperature,
      ...(input.system ? { system: input.system } : {}),
      tools: input.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema as Anthropic.Tool['input_schema'],
      })),
      messages: input.messages as Anthropic.MessageParam[],
    });

    const stopReason = (response.stop_reason ?? 'end_turn') as AgentLLMResponse['stopReason'];
    const content: AgentContentBlock[] = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        content.push({ type: 'text', text: block.text });
      } else if (block.type === 'tool_use') {
        content.push({
          type: 'tool_use',
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        });
      }
    }

    this.logger.debug(
      `[AgentLLM] stop_reason=${stopReason}, in=${response.usage.input_tokens}, out=${response.usage.output_tokens}`,
    );

    return {
      stopReason,
      content,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}
