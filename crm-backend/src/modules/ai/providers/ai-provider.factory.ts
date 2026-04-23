/**
 * AIProviderFactory — Creates Anthropic LLM and Ollama embedding providers.
 *
 * ENV variables:
 *   ANTHROPIC_API_KEY   — required
 *   LLM_MODEL           — optional (default: claude-3-5-sonnet-20241022)
 *   LLM_MAX_TOKENS      — optional (default: 1024)
 *   LLM_TEMPERATURE     — optional (default: 0.2)
 *   OLLAMA_BASE_URL     — optional (default: http://localhost:11434)
 *   OLLAMA_MODEL        — optional (default: nomic-embed-text)
 */

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LLMProvider } from './llm.interface';
import { EmbeddingProvider } from './embedding-provider.interface';
import { AnthropicLLMProvider } from './anthropic.service';
import { OllamaEmbeddingProvider } from './ollama-embedding.service';

const factoryLogger = new Logger('AIProviderFactory');

export class AIProviderFactory {
  static getLLM(config: ConfigService): LLMProvider {
    const apiKey = config.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      throw new Error('[AIProviderFactory] ANTHROPIC_API_KEY is not set.');
    }
    const model = config.get<string>('LLM_MODEL') ?? 'claude-3-5-sonnet-20241022';
    factoryLogger.log(`[LLM] Anthropic — model: ${model}`);
    return new AnthropicLLMProvider({
      apiKey,
      model,
      maxTokens: config.get<number>('LLM_MAX_TOKENS'),
      temperature: config.get<number>('LLM_TEMPERATURE'),
    });
  }

  static getEmbedding(config: ConfigService): EmbeddingProvider {
    const model = config.get<string>('OLLAMA_MODEL') ?? 'nomic-embed-text';
    const baseUrl = config.get<string>('OLLAMA_BASE_URL') ?? 'http://localhost:11434';
    factoryLogger.log(`[Embedding] Ollama — model: ${model}, url: ${baseUrl}`);
    return new OllamaEmbeddingProvider({ baseUrl, model });
  }
}
