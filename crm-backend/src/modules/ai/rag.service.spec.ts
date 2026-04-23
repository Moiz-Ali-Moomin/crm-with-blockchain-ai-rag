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

const mockLlmProvider = {
  generate: jest.fn().mockResolvedValue('Acme Corp had a deal won in May.'),
};

const mockCircuitBreaker = {
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
    mockLlmProvider.generate.mockResolvedValue('Acme Corp had a deal won in May.');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RagService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn().mockReturnValue('sk-ant-test-key'),
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'ANTHROPIC_API_KEY') return 'sk-ant-test-key';
              return undefined;
            }),
          },
        },
        { provide: LLM_PROVIDER, useValue: mockLlmProvider },
        { provide: VectorSearchService, useValue: mockVectorSearch },
        { provide: AiLogRepository, useValue: mockAiLogRepo },
        { provide: RedisService, useValue: mockRedis },
        { provide: CircuitBreakerService, useValue: mockCircuitBreaker },
        { provide: AiCostControlService, useValue: mockCostControl },
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
        fromCache: false,
      };
      mockRedis.get.mockResolvedValue(cached);

      const result = await service.query(makeRagParams());

      expect(result.fromCache).toBe(true);
      expect(result.answer).toBe('Cached answer.');
      expect(mockLlmProvider.generate).not.toHaveBeenCalled();
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

      await Promise.resolve();
      expect(mockAiLogRepo.create).toHaveBeenCalledTimes(1);
    });

    it('generates a stable cache key — same params produce same key', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockVectorSearch.search.mockResolvedValue([]);

      await service.query(makeRagParams());
      await service.query(makeRagParams());

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
      expect(mockLlmProvider.generate).not.toHaveBeenCalled();
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

    it('calls LLM provider with system prompt and user query containing the context', async () => {
      await service.query(makeRagParams());
      expect(mockLlmProvider.generate).toHaveBeenCalledTimes(1);

      const callArgs = mockLlmProvider.generate.mock.calls[0][0];
      expect(callArgs.system).toContain('CRM assistant');
      expect(callArgs.prompt).toBe('What happened with Acme Corp last month?');
      expect(callArgs.context).toContain('Acme Corp deal was won on May 15th.');
    });

    it('passes retrieved context to the LLM provider', async () => {
      await service.query(makeRagParams());
      const callArgs = mockLlmProvider.generate.mock.calls[0][0];
      expect(callArgs.context).toBeDefined();
      expect(callArgs.context).toContain('Email sent to Acme confirming the deal.');
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

    it('records estimated token usage in the response', async () => {
      const result = await service.query(makeRagParams());
      // estimatedTokens = Math.ceil((contextWindow.length + query.length) / 4)
      // context: '[activity] Acme Corp deal was won on May 15th.\n\n' (48) +
      //          '[communication] Email sent to Acme confirming the deal.\n\n' (57) = 105
      // query: 'What happened with Acme Corp last month?' = 40
      // Math.ceil(145/4) = 37
      expect(result.tokensUsed).toBe(37);
    });

    it('returns fromCache=false', async () => {
      const result = await service.query(makeRagParams());
      expect(result.fromCache).toBe(false);
    });

    it('fires an audit log with the provider and metadata', async () => {
      await service.query(makeRagParams());
      await Promise.resolve();

      expect(mockAiLogRepo.create).toHaveBeenCalledTimes(1);
      const [logArgs] = mockAiLogRepo.create.mock.calls[0];
      expect(logArgs.tenantId).toBe(TENANT_ID);
      expect(logArgs.operationType).toBe('rag_query');
      expect(logArgs.metadata).toMatchObject({ provider: 'anthropic', temperature: 0.2 });
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
      mockLlmProvider.generate.mockResolvedValue('answer');

      const bigChunks: SemanticSearchResult[] = Array.from({ length: 20 }, (_, i) =>
        makeChunk(`id-${i}`, 'activity', 0.9, 'A'.repeat(1500)),
      );
      mockVectorSearch.search.mockResolvedValue(bigChunks);

      await service.query(makeRagParams());

      const callArgs = mockLlmProvider.generate.mock.calls[0][0];
      // Context must never exceed MAX_CONTEXT_CHARS (12,000)
      expect(callArgs.context.length).toBeLessThan(12_000 + 500);
    });
  });

  // ── Audit log resilience ────────────────────────────────────────────────────

  describe('audit log resilience', () => {
    it('does NOT throw when the audit log write fails', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockVectorSearch.search.mockResolvedValue([]);
      mockAiLogRepo.create.mockRejectedValue(new Error('MongoDB connection lost'));

      await expect(service.query(makeRagParams())).resolves.toBeDefined();
    });
  });
});
