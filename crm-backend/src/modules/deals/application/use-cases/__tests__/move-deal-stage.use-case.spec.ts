/**
 * MoveDealStageUseCase Unit Tests
 *
 * Tests the most complex orchestration in the system:
 * - State machine enforcement (via domain entity)
 * - Blockchain job enqueue on WON
 * - Payment intent on USDC WON
 * - Notification on WON/LOST
 * - Non-fatal payment errors must not fail the use-case
 */

import { MoveDealStageUseCase } from '../move-deal-stage.use-case';
import { DEAL_REPOSITORY_PORT, DealRepositoryPort } from '../../ports/deal.repository.port';
import { BLOCKCHAIN_PORT, BlockchainPort } from '../../ports/blockchain.port';
import { WALLET_PORT, WalletPort } from '../../ports/wallet.port';
import { PAYMENT_PORT, PaymentPort } from '../../ports/payment.port';
import { EVENT_PUBLISHER_PORT, EventPublisherPort } from '../../ports/event-publisher.port';
import { NotFoundError } from '../../../../../shared/errors/domain.errors';
import { InvalidDealStateTransitionError } from '../../../domain/errors/deal.errors';
import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from '../../../../../core/cache/redis.service';

// ── Mock factories ────────────────────────────────────────────────────────────

const openDeal = {
  id: 'deal-001', title: 'Acme Deal', value: 10000, currency: 'USD',
  status: 'OPEN', stageId: 'stage-001', pipelineId: 'pipe-001',
  tenantId: 'tenant-001', ownerId: 'user-001', contactId: null,
  companyId: null, wonAt: null, lostAt: null, lostReason: null,
  createdAt: new Date(), updatedAt: new Date(),
};

const wonStage   = { id: 'stage-won', isWon: true,  isLost: false, name: 'Closed Won',  probability: 1 };
const lostStage  = { id: 'stage-lost', isWon: false, isLost: true,  name: 'Closed Lost', probability: 0 };
const nextStage  = { id: 'stage-002', isWon: false,  isLost: false, name: 'Negotiation', probability: 0.5 };

const makeMockRepo = (overrides: Partial<jest.Mocked<DealRepositoryPort>> = {}): jest.Mocked<DealRepositoryPort> => ({
  findById:             jest.fn().mockResolvedValue(openDeal),
  findStageInPipeline:  jest.fn().mockResolvedValue(nextStage),
  updateInTransaction:  jest.fn().mockResolvedValue({ ...openDeal, stageId: nextStage.id }),
  create:               jest.fn(),
  update:               jest.fn(),
  delete:               jest.fn(),
  recordStageHistory:   jest.fn(),
  findAll:              jest.fn(),
  getKanbanBoard:       jest.fn(),
  getForecast:          jest.fn(),
  ...overrides,
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MoveDealStageUseCase', () => {
  let useCase: MoveDealStageUseCase;
  let mockRepo: jest.Mocked<DealRepositoryPort>;
  let mockBlockchain: jest.Mocked<BlockchainPort>;
  let mockWallets: jest.Mocked<WalletPort>;
  let mockPayments: jest.Mocked<PaymentPort>;
  let mockEvents: jest.Mocked<EventPublisherPort>;

  beforeEach(async () => {
    mockRepo       = makeMockRepo();
    mockBlockchain = {
      computeDealHash:         jest.fn().mockReturnValue('0xabc123'),
      enqueueDealRegistration: jest.fn().mockResolvedValue(undefined),
    };
    mockWallets = {
      findTenantWalletOnChain: jest.fn().mockResolvedValue(null),
    };
    mockPayments = {
      enqueuePaymentIntent: jest.fn().mockResolvedValue(undefined),
    };
    mockEvents = {
      publishAutomation:   jest.fn().mockResolvedValue(undefined),
      publishWebhook:      jest.fn().mockResolvedValue(undefined),
      publishNotification: jest.fn().mockResolvedValue(undefined),
      emitWebSocket:       jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MoveDealStageUseCase,
        { provide: DEAL_REPOSITORY_PORT, useValue: mockRepo },
        { provide: BLOCKCHAIN_PORT,      useValue: mockBlockchain },
        { provide: WALLET_PORT,          useValue: mockWallets },
        { provide: PAYMENT_PORT,         useValue: mockPayments },
        { provide: EVENT_PUBLISHER_PORT, useValue: mockEvents },
        {
          provide: RedisService,
          useValue: { del: jest.fn().mockResolvedValue(1), get: jest.fn(), set: jest.fn() },
        },
      ],
    }).compile();

    useCase = module.get(MoveDealStageUseCase);
  });

  describe('regular stage move', () => {
    it('should update deal stage and fire DEAL_STAGE_CHANGED automation', async () => {
      await useCase.execute('deal-001', { stageId: 'stage-002' }, 'user-001', 'tenant-001');

      expect(mockRepo.updateInTransaction).toHaveBeenCalledTimes(1);
      expect(mockEvents.publishAutomation).toHaveBeenCalledWith(
        'tenant-001', 'DEAL_STAGE_CHANGED', 'deal-001', expect.anything(),
      );
      expect(mockBlockchain.computeDealHash).not.toHaveBeenCalled();
    });
  });

  describe('WON transition', () => {
    beforeEach(() => {
      mockRepo.findStageInPipeline.mockResolvedValue(wonStage as any);
      mockRepo.updateInTransaction.mockResolvedValue({
        ...openDeal, status: 'WON', stageId: wonStage.id, wonAt: new Date(),
      } as any);
    });

    it('should enqueue blockchain registration when deal is WON', async () => {
      await useCase.execute('deal-001', { stageId: 'stage-won' }, 'user-001', 'tenant-001');

      expect(mockBlockchain.computeDealHash).toHaveBeenCalledTimes(1);
      expect(mockBlockchain.enqueueDealRegistration).toHaveBeenCalledTimes(1);
    });

    it('should fire DEAL_WON automation event', async () => {
      await useCase.execute('deal-001', { stageId: 'stage-won' }, 'user-001', 'tenant-001');

      expect(mockEvents.publishAutomation).toHaveBeenCalledWith(
        'tenant-001', 'DEAL_WON', 'deal-001', expect.anything(),
      );
    });

    it('should send WON notification to deal owner', async () => {
      await useCase.execute('deal-001', { stageId: 'stage-won' }, 'user-001', 'tenant-001');

      expect(mockEvents.publishNotification).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-001', type: 'deal_won' }),
      );
    });

    it('should NOT enqueue payment for non-USDC deals', async () => {
      await useCase.execute('deal-001', { stageId: 'stage-won' }, 'user-001', 'tenant-001');
      expect(mockPayments.enqueuePaymentIntent).not.toHaveBeenCalled();
    });

    it('should enqueue payment for USDC deals when wallet is available', async () => {
      const usdcDeal = { ...openDeal, currency: 'USDC', value: 5000 };
      mockRepo.findById.mockResolvedValue(usdcDeal as any);
      mockRepo.updateInTransaction.mockResolvedValue({
        ...usdcDeal, status: 'WON', wonAt: new Date(),
      } as any);
      mockWallets.findTenantWalletOnChain.mockResolvedValue({
        id: 'wallet-001', type: 'TENANT', chain: 'POLYGON', address: '0xabc', tenantId: 'tenant-001',
      });

      await useCase.execute('deal-001', { stageId: 'stage-won' }, 'user-001', 'tenant-001');

      expect(mockPayments.enqueuePaymentIntent).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: 'deal-won:deal-001',
          dealId:         'deal-001',
        }),
      );
    });

    it('should still succeed even if payment enqueue throws (non-fatal)', async () => {
      const usdcDeal = { ...openDeal, currency: 'USDC', value: 5000 };
      mockRepo.findById.mockResolvedValue(usdcDeal as any);
      mockRepo.updateInTransaction.mockResolvedValue({
        ...usdcDeal, status: 'WON', wonAt: new Date(),
      } as any);
      mockWallets.findTenantWalletOnChain.mockResolvedValue({
        id: 'wallet-001', type: 'TENANT', chain: 'POLYGON', address: '0xabc', tenantId: 'tenant-001',
      });
      mockPayments.enqueuePaymentIntent.mockRejectedValue(new Error('Queue unavailable'));

      // Must not throw — payment failure is non-fatal
      await expect(
        useCase.execute('deal-001', { stageId: 'stage-won' }, 'user-001', 'tenant-001'),
      ).resolves.toBeDefined();
    });
  });

  describe('LOST transition', () => {
    beforeEach(() => {
      mockRepo.findStageInPipeline.mockResolvedValue(lostStage as any);
      mockRepo.updateInTransaction.mockResolvedValue({
        ...openDeal, status: 'LOST', stageId: lostStage.id, lostAt: new Date(), lostReason: 'Price',
      } as any);
    });

    it('should NOT enqueue blockchain registration for LOST deals', async () => {
      await useCase.execute('deal-001', { stageId: 'stage-lost', lostReason: 'Price' }, 'user-001', 'tenant-001');
      expect(mockBlockchain.enqueueDealRegistration).not.toHaveBeenCalled();
    });

    it('should send LOST notification to owner', async () => {
      await useCase.execute('deal-001', { stageId: 'stage-lost' }, 'user-001', 'tenant-001');
      expect(mockEvents.publishNotification).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'deal_lost' }),
      );
    });
  });

  describe('error cases', () => {
    it('should throw NotFoundError when deal does not exist', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(
        useCase.execute('nonexistent', { stageId: 'stage-002' }, 'user-001', 'tenant-001'),
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw when stage does not belong to pipeline', async () => {
      mockRepo.findStageInPipeline.mockResolvedValue(null);
      await expect(
        useCase.execute('deal-001', { stageId: 'bad-stage' }, 'user-001', 'tenant-001'),
      ).rejects.toThrow();
    });

    it('should throw InvalidDealStateTransitionError for WON → regular move', async () => {
      mockRepo.findById.mockResolvedValue({ ...openDeal, status: 'WON' } as any);
      mockRepo.findStageInPipeline.mockResolvedValue(nextStage as any);

      await expect(
        useCase.execute('deal-001', { stageId: 'stage-002' }, 'user-001', 'tenant-001'),
      ).rejects.toThrow(InvalidDealStateTransitionError);
    });
  });
});
