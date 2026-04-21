import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RagService, RagQueryParams, RagResponse } from './rag.service';
import { VectorSearchService, SemanticSearchResult } from './vector-search.service';
import { AiLogRepository } from './repositories/ai-log.repository';
import { RedisService } from '../../core/cache/redis.service';
import { CircuitBreakerService } from '../../core/resilience/circuit-breaker.service';
import { AiCostControlService } from './cost-control.service';
import { BusinessMetricsService } from '../../core/metrics/business-metrics.service';
import { LLM_PROVIDER } from './providers/llm.interface';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-abc';

function makeChunk(
  entityId: string,
  entityType: 'activity' | 'communication' | 'ticket',
  similarity: number,
  content = 'Sample CRM context content.',
): SemanticSearchResult {
  return { id: `embed-${entityId}`, entityId, entityType, similarity, content, metadata: {} };
}

function makeRagParams(overrides: Partial<RagQueryParams> = {}): RagQueryParams {
  return {
    tenantId: TENANT_ID,
    query: 'What happened with Acme Corp last month?',
    ...overrides,
  };
}

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockVectorSearch = {
  search: jest.fn(),
};

const mockAiLogRepo = {
  create: jest.fn().mockResolvedValue({}),
};

const mockRedis = {
  get: jest.fn(),
  set: jest.fn().mockResolvedValue('OK'),
};

// LLM provider mock — matches the LLMProvider interface: generate() => Promise<string>
const mockLlmGenerate = jest.fn().mockResolvedValue('Acme Corp had a deal won in May.');
const mockLlmProvider = { generate: mockLlmGenerate };

const mockCircuitBreaker = {
  // Execute the callback directly — no circuit-breaking in tests
  execute: jest.fn().mockImplementation((_name: string, fn: () => unknown) => fn()),
};

const mockCostControl = {
  assertQuota: jest.fn().mockResolvedValue(undefined),
  recordUsage: jest.fn().mockResolvedValue(undefined),
};

const mockBusinessMetrics = {
  recordAiUsage: jest.fn(),
};


// ── Test suite ────────────────────────────────────────────────────────────────

describe('RagService', () => {
  let service: RagService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Reset the LLM mock to its default successful response
    mockLlmGenerate.mockResolvedValue('Acme Corp had a deal won in May.');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RagService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn().mockReturnValue('sk-test-key'),
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'ENABLE_AI') return 'true';
              if (key === 'ANTHROPIC_API_KEY') return 'sk-ant-test';
              return undefined;
            }),
          },
        },
        { provide: LLM_PROVIDER,          useValue: mockLlmProvider },
        { provide: VectorSearchService,    useValue: mockVectorSearch },
        { provide: AiLogRepository,        useValue: mockAiLogRepo },
        { provide: RedisService,           useValue: mockRedis },
        { provide: CircuitBreakerService,  useValue: mockCircuitBreaker },
        { provide: AiCostControlService,   useValue: mockCostControl },
        { provide: BusinessMetricsService, useValue: mockBusinessMetrics },
      ],
    }).compile();

    service = module.get<RagService>(RagService);
  });

  // ── Cache hit ───────────────────────────────────────────────────────────────

  describe('cache hit', () => {
    it('returns cached result with fromCache=true without calling LLM', async () => {
      const cached: RagResponse = {
        answer: 'Cached answer.',
        sources: [],
        confidence: 0.85,
        fromCache: false, // raw stored value — service overwrites to true
      };
      mockRedis.get.mockResolvedValue(cached);

      const result = await service.query(makeRagParams());

      expect(result.fromCache).toBe(true);
      expect(result.answer).toBe('Cached answer.');
      expect(mockLlmGenerate).not.toHaveBeenCalled();
      expect(mockVectorSearch.search).not.toHaveBeenCalled();
    });

    it('still fires an audit log on cache hit (fire-and-forget)', async () => {
      mockRedis.get.mockResolvedValue({
        answer: 'cached',
        sources: [],
        confidence: 0.9,
        fromCache: false,
      });

      await service.query(makeRagParams());

      // Allow microtask queue to flush for the fire-and-forget log
      await Promise.resolve();
      expect(mockAiLogRepo.create).toHaveBeenCalledTimes(1);
    });

    it('generates a stable cache key — same params produce same key', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockVectorSearch.search.mockResolvedValue([]);

      await service.query(makeRagParams());
      await service.query(makeRagParams());

      // Same params → same cache key → redis.get called with identical key twice
      const [firstKey] = mockRedis.get.mock.calls[0];
      const [secondKey] = mockRedis.get.mock.calls[1];
      expect(firstKey).toBe(secondKey);
    });

    it('generates different cache keys for different queries', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockVectorSearch.search.mockResolvedValue([]);

      await service.query(makeRagParams({ query: 'query A' }));
      await service.query(makeRagParams({ query: 'query B' }));

      const [keyA] = mockRedis.get.mock.calls[0];
      const [keyB] = mockRedis.get.mock.calls[1];
      expect(keyA).not.toBe(keyB);
    });

    it('cache key is tenant-scoped — same query different tenant uses different key', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockVectorSearch.search.mockResolvedValue([]);

      await service.query(makeRagParams({ tenantId: 'tenant-1' }));
      await service.query(makeRagParams({ tenantId: 'tenant-2' }));

      const [key1] = mockRedis.get.mock.calls[0];
      const [key2] = mockRedis.get.mock.calls[1];
      expect(key1).not.toBe(key2);
      expect(key1).toContain('tenant-1');
      expect(key2).toContain('tenant-2');
    });
  });

  // ── No chunks retrieved ─────────────────────────────────────────────────────

  describe('no chunks retrieved', () => {
    beforeEach(() => {
      mockRedis.get.mockResolvedValue(null);
      mockVectorSearch.search.mockResolvedValue([]);
    });

    it('returns fromCache=false, confidence=0, empty sources', async () => {
      const result = await service.query(makeRagParams());
      expect(result.fromCache).toBe(false);
      expect(result.confidence).toBe(0);
      expect(result.sources).toHaveLength(0);
    });

    it('answer mentions no relevant records were found', async () => {
      const result = await service.query(makeRagParams());
      expect(result.answer.toLowerCase()).toContain('could not find');
    });

    it('does NOT call LLM when there are no chunks', async () => {
      await service.query(makeRagParams());
      expect(mockLlmGenerate).not.toHaveBeenCalled();
    });

    it('does NOT cache the no-context response', async () => {
      await service.query(makeRagParams());
      expect(mockRedis.set).not.toHaveBeenCalled();
    });

    it('still fires an audit log', async () => {
      await service.query(makeRagParams());
      await Promise.resolve();
      expect(mockAiLogRepo.create).toHaveBeenCalledTimes(1);
    });
  });

  // ── Happy path (chunks + LLM) ───────────────────────────────────────────────

  describe('happy path — chunks retrieved and LLM called', () => {
    const chunks: SemanticSearchResult[] = [
      makeChunk('a1', 'activity', 0.95, 'Acme Corp deal was won on May 15th.'),
      makeChunk('c1', 'communication', 0.88, 'Email sent to Acme confirming the deal.'),
    ];

    beforeEach(() => {
      mockRedis.get.mockResolvedValue(null);
      mockVectorSearch.search.mockResolvedValue(chunks);
    });

    it('calls VectorSearchService.search with correct tenant and params', async () => {
      await service.query(makeRagParams({ topK: 5, threshold: 0.8 }));
      expect(mockVectorSearch.search).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          limit: 5,
          threshold: 0.8,
        }),
      );
    });

    it('calls LLM provider with system prompt and context in the prompt', async () => {
      await service.query(makeRagParams());
      expect(mockLlmGenerate).toHaveBeenCalledTimes(1);

      const [callArgs] = mockLlmGenerate.mock.calls[0];
      expect(callArgs.system).toContain('CRM assistant');
      expect(callArgs.prompt).toContain('What happened with Acme Corp last month?');
      // context is the raw chunk text window built by buildContextWindow()
      expect(callArgs.context).toBeTruthy();
      expect(typeof callArgs.context).toBe('string');
    });

    it('calls LLM provider with context containing chunk content', async () => {
      await service.query(makeRagParams());
      const [callArgs] = mockLlmGenerate.mock.calls[0];
      // Context should contain content from the retrieved chunks
      expect(callArgs.context ?? callArgs.prompt).toContain('Acme Corp deal was won on May 15th.');
    });

    it('returns the LLM answer in the response', async () => {
      const result = await service.query(makeRagParams());
      expect(result.answer).toBe('Acme Corp had a deal won in May.');
    });

    it('calculates confidence as average similarity rounded to 3dp', async () => {
      const result = await service.query(makeRagParams());
      // (0.95 + 0.88) / 2 = 0.915
      expect(result.confidence).toBe(0.915);
    });

    it('maps sources correctly with excerpt capped at 200 chars', async () => {
      const longContent = 'X'.repeat(500);
      mockVectorSearch.search.mockResolvedValue([
        makeChunk('a1', 'activity', 0.9, longContent),
      ]);

      const result = await service.query(makeRagParams());
      expect(result.sources[0].excerpt).toHaveLength(200);
      expect(result.sources[0].entityId).toBe('a1');
      expect(result.sources[0].entityType).toBe('activity');
    });

    it('rounds source similarity to 3 decimal places', async () => {
      mockVectorSearch.search.mockResolvedValue([
        makeChunk('a1', 'activity', 0.91234567, 'text'),
      ]);

      const result = await service.query(makeRagParams());
      expect(result.sources[0].similarity).toBe(0.912);
    });

    it('caches the result for future requests', async () => {
      await service.query(makeRagParams());
      expect(mockRedis.set).toHaveBeenCalledTimes(1);
      const [cacheKey, cachedValue] = mockRedis.set.mock.calls[0];
      expect(cacheKey).toContain(TENANT_ID);
      expect(cachedValue.answer).toBe('Acme Corp had a deal won in May.');
    });

    it('returns fromCache=false', async () => {
      const result = await service.query(makeRagParams());
      expect(result.fromCache).toBe(false);
    });

    it('fires an audit log with operationType rag_query', async () => {
      await service.query(makeRagParams());
      await Promise.resolve();

      expect(mockAiLogRepo.create).toHaveBeenCalledTimes(1);
      const [logArgs] = mockAiLogRepo.create.mock.calls[0];
      expect(logArgs.tenantId).toBe(TENANT_ID);
      expect(logArgs.operationType).toBe('rag_query');
    });
  });

  // ── Default parameter values ────────────────────────────────────────────────

  describe('default parameter values', () => {
    it('defaults topK to 8 when not specified', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockVectorSearch.search.mockResolvedValue([]);

      await service.query({ tenantId: TENANT_ID, query: 'test' });

      expect(mockVectorSearch.search).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 8 }),
      );
    });

    it('defaults threshold to 0.72 when not specified', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockVectorSearch.search.mockResolvedValue([]);

      await service.query({ tenantId: TENANT_ID, query: 'test' });

      expect(mockVectorSearch.search).toHaveBeenCalledWith(
        expect.objectContaining({ threshold: 0.72 }),
      );
    });

    it('defaults entityTypes to all three when not specified', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockVectorSearch.search.mockResolvedValue([]);

      await service.query({ tenantId: TENANT_ID, query: 'test' });

      expect(mockVectorSearch.search).toHaveBeenCalledWith(
        expect.objectContaining({
          entityTypes: expect.arrayContaining(['activity', 'communication', 'ticket']),
        }),
      );
    });
  });

  // ── Context window budget ───────────────────────────────────────────────────

  describe('context window budget', () => {
    it('stops appending chunks once MAX_CONTEXT_CHARS (12,000) is exceeded', async () => {
      mockRedis.get.mockResolvedValue(null);

      // Create 20 chunks each with 1500 chars of content — will overflow the budget
      const bigChunks: SemanticSearchResult[] = Array.from({ length: 20 }, (_, i) =>
        makeChunk(`id-${i}`, 'activity', 0.9, 'A'.repeat(1500)),
      );
      mockVectorSearch.search.mockResolvedValue(bigChunks);

      await service.query(makeRagParams());

      expect(mockLlmGenerate).toHaveBeenCalledTimes(1);
      const [callArgs] = mockLlmGenerate.mock.calls[0];
      // The context passed to the LLM should not exceed MAX_CONTEXT_CHARS
      const contextOrPrompt: string = callArgs.context ?? callArgs.prompt ?? '';
      expect(contextOrPrompt.length).toBeLessThan(12_000 + 500);
    });
  });

  // ── Audit log resilience ────────────────────────────────────────────────────

  describe('audit log resilience', () => {
    it('does NOT throw when the audit log write fails', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockVectorSearch.search.mockResolvedValue([]);
      mockAiLogRepo.create.mockRejectedValue(new Error('MongoDB connection lost'));

      // Should still resolve cleanly
      await expect(service.query(makeRagParams())).resolves.toBeDefined();
    });
  });
});
