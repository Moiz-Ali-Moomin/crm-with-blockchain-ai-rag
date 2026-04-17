/**
 * BlockchainListenerService
 *
 * Long-lived service that subscribes to USDC Transfer events on configured chains.
 * Runs on application bootstrap, reconnects automatically on provider failure.
 *
 * Architecture:
 *   listener (this service) → blockchain-events queue → BlockchainEventsWorker
 *   → PaymentsService.handleTxDetected() → transaction-confirmation queue
 *   → TransactionConfirmationWorker → PaymentsService.handleConfirmationUpdate()
 *
 * Leader election (per-chain Redis SET NX):
 *   Each chain independently races for `listener_leader:{chain}` (TTL 30 s).
 *   Winner runs WS / HTTP ingestion and renews its key every 10 s.
 *   Loser enters a standby probe loop (5 s interval); takes over if key expires.
 *   If renewal fails the active instance self-demotes to standby immediately.
 *
 * WS ↔ HTTP fallback (unchanged):
 *   WebSocket is preferred; HTTP polling is the automatic fallback.
 *   Reconnect uses exponential backoff capped at 60 s.
 *
 * Mode override (LISTENER_MODE env var):
 *   active  — always active for every chain, skip Redis
 *   standby — always standby for every chain, skip Redis
 *   auto    — per-chain Redis election (default)
 */

import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ethers } from 'ethers';
import { QUEUE_NAMES, QUEUE_JOB_OPTIONS } from '../../../core/queue/queue.constants';
import { LeaderElectionService } from '../../../core/leader/leader-election.service';

const ERC20_TRANSFER_ABI = [
  'event Transfer(address indexed from, address indexed to, uint256 value)',
];

// Testnet addresses — swap for mainnet when NODE_ENV=production on real network
const USDC_CONTRACTS: Record<string, string> = {
  POLYGON:  '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582', // Polygon Amoy testnet
  BASE:     '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // Base Sepolia testnet
  ETHEREUM: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', // Ethereum Sepolia testnet
};

const RPC_ENV_KEYS: Record<string, string> = {
  POLYGON:  'BLOCKCHAIN_RPC_URL_POLYGON',
  BASE:     'BLOCKCHAIN_RPC_URL_BASE',
  ETHEREUM: 'BLOCKCHAIN_RPC_URL_ETHEREUM',
};

const RECONNECT_LOOKBACK_BLOCKS = 20;
const MAX_RECONNECT_DELAY_MS    = 60_000;

export interface BlockchainTransferEvent {
  chain:       string;
  txHash:      string;
  blockNumber: number;
  logIndex:    number;
  fromAddress: string;
  toAddress:   string;
  /** Raw amount as string (USDC 6 decimals) */
  amountRaw:   string;
  timestamp:   number;
}

@Injectable()
export class BlockchainListenerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(BlockchainListenerService.name);

  // Ingestion resources keyed by chain
  private providers       = new Map<string, ethers.Provider>();
  private contracts       = new Map<string, ethers.Contract>();
  private reconnectTimers = new Map<string, NodeJS.Timeout>();

  // Leader election resources keyed by chain
  private leaderStates    = new Map<string, 'active' | 'standby'>();
  private renewalTimers   = new Map<string, NodeJS.Timeout>();
  private standbyTimers   = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly config: ConfigService,
    private readonly leader: LeaderElectionService,
    @InjectQueue(QUEUE_NAMES.BLOCKCHAIN_EVENTS)
    private readonly eventsQueue: Queue,
  ) {}

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async onApplicationBootstrap(): Promise<void> {
    const chains = this.config
      .get<string>('BLOCKCHAIN_LISTENER_CHAINS', 'POLYGON')
      .split(',')
      .map((c) => c.trim().toUpperCase());

    for (const chain of chains) {
      const isActive = await this.leader.tryAcquire(chain);
      if (isActive) {
        await this.becomeActive(chain);
      } else {
        this.becomeStandby(chain);
      }
    }
  }

  async onApplicationShutdown(): Promise<void> {
    // Release all held leadership keys
    for (const [chain, state] of this.leaderStates) {
      if (state === 'active') {
        await this.leader.release(chain).catch(() => {});
      }
    }

    // Cancel all timers
    for (const timer of this.renewalTimers.values())   clearInterval(timer);
    for (const timer of this.standbyTimers.values())   clearInterval(timer);
    for (const timer of this.reconnectTimers.values()) clearTimeout(timer);

    this.renewalTimers.clear();
    this.standbyTimers.clear();
    this.reconnectTimers.clear();

    // Tear down all active contracts/providers
    for (const [, contract] of this.contracts) {
      await contract.removeAllListeners().catch(() => {});
    }
    for (const [, provider] of this.providers) {
      await (provider as ethers.AbstractProvider).destroy?.();
    }
    this.contracts.clear();
    this.providers.clear();
    this.leaderStates.clear();
  }

  // ─── Leader State Transitions ──────────────────────────────────────────────

  private async becomeActive(chain: string): Promise<void> {
    this.leaderStates.set(chain, 'active');
    this.clearStandbyTimer(chain);
    await this.startListening(chain, 0);
    this.startRenewal(chain);
  }

  private becomeStandby(chain: string): void {
    this.leaderStates.set(chain, 'standby');
    this.clearRenewalTimer(chain);
    this.teardownChain(chain);
    this.startStandbyProbe(chain);
  }

  // ─── Renewal ───────────────────────────────────────────────────────────────

  private startRenewal(chain: string): void {
    this.clearRenewalTimer(chain);

    const timer = setInterval(async () => {
      const ok = await this.leader.renew(chain).catch(() => false);
      if (!ok && this.leaderStates.get(chain) === 'active') {
        this.becomeStandby(chain);
      }
    }, this.leader.renewIntervalMs);

    this.renewalTimers.set(chain, timer);
  }

  private clearRenewalTimer(chain: string): void {
    const t = this.renewalTimers.get(chain);
    if (t) { clearInterval(t); this.renewalTimers.delete(chain); }
  }

  // ─── Standby Probe ─────────────────────────────────────────────────────────

  private startStandbyProbe(chain: string): void {
    this.clearStandbyTimer(chain);

    const timer = setInterval(async () => {
      if (this.leaderStates.get(chain) !== 'standby') return;

      try {
        const absent = await this.leader.isLeaderAbsent(chain);
        if (!absent) return;

        const acquired = await this.leader.tryAcquire(chain);
        if (acquired) {
          await this.becomeActive(chain);
        }
      } catch (err) {
        this.logger.error(
          `[${chain}] standby probe error: ${(err as Error).message}`,
        );
      }
    }, this.leader.standbyProbeIntervalMs);

    this.standbyTimers.set(chain, timer);
  }

  private clearStandbyTimer(chain: string): void {
    const t = this.standbyTimers.get(chain);
    if (t) { clearInterval(t); this.standbyTimers.delete(chain); }
  }

  // ─── Chain Teardown (demote to standby) ────────────────────────────────────

  private teardownChain(chain: string): void {
    const reconnect = this.reconnectTimers.get(chain);
    if (reconnect) { clearTimeout(reconnect); this.reconnectTimers.delete(chain); }

    const contract = this.contracts.get(chain);
    if (contract) { contract.removeAllListeners().catch(() => {}); this.contracts.delete(chain); }

    const provider = this.providers.get(chain);
    if (provider) {
      (provider as any).destroy?.();
      this.providers.delete(chain);
    }
  }

  // ─── WS / HTTP Ingestion ───────────────────────────────────────────────────

  private async startListening(chain: string, attempt: number): Promise<void> {
    if (this.leaderStates.get(chain) !== 'active') return;

    const rpcUrl     = this.config.get<string>(RPC_ENV_KEYS[chain] ?? '') || this.config.get<string>('RPC_URL', '');
    const usdcAddress = USDC_CONTRACTS[chain];

    if (!rpcUrl || !usdcAddress) {
      this.logger.warn(`[${chain}] Skipping: RPC URL or USDC address not configured`);
      return;
    }

    try {
      const provider = rpcUrl.startsWith('wss://')
        ? new ethers.WebSocketProvider(rpcUrl)
        : new ethers.JsonRpcProvider(rpcUrl);

      const contract    = new ethers.Contract(usdcAddress, ERC20_TRANSFER_ABI, provider);
      const currentBlock = await provider.getBlockNumber();
      const fromBlock    = Math.max(0, currentBlock - RECONNECT_LOOKBACK_BLOCKS);

      contract.on('Transfer', async (from, to, value, event) => {
        await this.handleTransferEvent(chain, from, to, value, event);
      });

      if (rpcUrl.startsWith('wss://')) {
        const ws = (provider as ethers.WebSocketProvider).websocket;
        (ws as any).on?.('error', (err: Error) => {
          this.logger.error(`[${chain}] WebSocket error: ${err.message}`);
          if (this.leaderStates.get(chain) === 'active') {
            this.teardownChain(chain);
            this.scheduleReconnect(chain, attempt);
          }
        });
        (ws as any).on?.('close', () => {
          this.logger.warn(`[${chain}] WebSocket closed — reconnecting`);
          if (this.leaderStates.get(chain) === 'active') {
            this.teardownChain(chain);
            this.scheduleReconnect(chain, attempt);
          }
        });
      }

      this.providers.set(chain, provider);
      this.contracts.set(chain, contract);

      this.logger.log(
        `[${chain}] listener_active on USDC ${usdcAddress} (from block ~${fromBlock})`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[${chain}] listener failed to start (attempt ${attempt}): ${msg}`);
      if (this.leaderStates.get(chain) === 'active') {
        this.scheduleReconnect(chain, attempt);
      }
    }
  }

  private scheduleReconnect(chain: string, attempt: number): void {
    const delay = Math.min(2_000 * 2 ** attempt, MAX_RECONNECT_DELAY_MS);
    this.logger.log(`[${chain}] reconnect in ${delay}ms (attempt ${attempt + 1})`);

    const timer = setTimeout(async () => {
      this.reconnectTimers.delete(chain);
      if (this.leaderStates.get(chain) === 'active') {
        await this.startListening(chain, attempt + 1);
      }
    }, delay);

    this.reconnectTimers.set(chain, timer);
  }

  // ─── Event Handler ─────────────────────────────────────────────────────────

  private async handleTransferEvent(
    chain: string,
    from:  string,
    to:    string,
    value: bigint,
    event: ethers.EventLog,
  ): Promise<void> {
    const jobId = `transfer-${chain}-${event.transactionHash}-${event.index}`;

    const payload: BlockchainTransferEvent = {
      chain,
      txHash:      event.transactionHash,
      blockNumber: event.blockNumber,
      logIndex:    event.index,
      fromAddress: from.toLowerCase(),
      toAddress:   to.toLowerCase(),
      amountRaw:   value.toString(),
      timestamp:   Math.floor(Date.now() / 1000),
    };

    try {
      await this.eventsQueue.add('process_transfer', payload, {
        ...QUEUE_JOB_OPTIONS.blockchainEvents,
        jobId,
      });

      this.logger.debug(
        `[${chain}] Queued Transfer: ${from} → ${to} ${value} (${event.transactionHash.slice(0, 12)}...)`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[${chain}] Failed to enqueue ${jobId}: ${msg}`);
    }
  }
}
