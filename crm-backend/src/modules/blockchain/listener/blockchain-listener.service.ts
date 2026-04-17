/**
 * BlockchainListenerService
 *
 * Production-grade USDC Transfer event ingestion for configured chains.
 *
 * Architecture:
 *   listener (this service) → blockchain-events queue → BlockchainEventsWorker
 *   → PaymentsService.handleTxDetected() → transaction-confirmation queue
 *
 * Reliability features:
 *   RPC pool     — per-chain ordered list of URLs; rotates on provider failure
 *   Retry        — 3 attempts with linear back-off for transient RPC errors (503, timeout)
 *   Replay       — on (re)connect, fetches getLogs from (lastBlock − 5) in 500-block chunks
 *                  to recover events missed during downtime or provider outage
 *   Dedup        — Redis SET NX (2-day TTL) prevents duplicate enqueue across restarts;
 *                  BullMQ jobId is the secondary fallback guard
 *   Last block   — Redis stores last processed block per chain (7-day TTL) to anchor replays
 *   Confirmations — replay events are only enqueued once CONFIRMATIONS_REQUIRED blocks have
 *                   elapsed; live events are enqueued immediately and confirmed by the worker
 *
 * Leader election (per-chain Redis SET NX):
 *   Each chain races for `listener_leader:{chain}` (TTL 30 s).
 *   Winner runs ingestion and renews every 10 s.
 *   Loser enters a standby probe loop (5 s); takes over if key expires.
 *
 * Mode override (LISTENER_MODE env var):
 *   active  — always active, skip Redis election
 *   standby — always standby, skip Redis election
 *   auto    — per-chain Redis election (default)
 */

import {
  Injectable,
  Inject,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ethers } from 'ethers';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger as WinstonLogger } from 'winston';
import { QUEUE_NAMES, QUEUE_JOB_OPTIONS } from '../../../core/queue/queue.constants';
import { LeaderElectionService } from '../../../core/leader/leader-election.service';
import { RedisService } from '../../../core/cache/redis.service';

// ─── Constants ─────────────────────────────────────────────────────────────────

const ERC20_TRANSFER_ABI = [
  'event Transfer(address indexed from, address indexed to, uint256 value)',
];

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

// Public free-tier fallbacks — last resort when primary RPC fails
const RPC_PUBLIC_FALLBACKS: Record<string, string[]> = {
  POLYGON:  [
    'https://rpc-amoy.polygon.technology',
    'https://polygon-amoy-bor-rpc.publicnode.com',
  ],
  BASE:     ['https://sepolia.base.org'],
  ETHEREUM: ['https://ethereum-sepolia-rpc.publicnode.com'],
};

const RECONNECT_LOOKBACK_BLOCKS  = 20;
const MAX_RECONNECT_DELAY_MS     = 60_000;
const MAX_LOGS_CHUNK_BLOCKS      = 500;         // Polygon Amoy getLogs limit
const RPC_RETRY_COUNT            = 3;
const LAST_BLOCK_TTL_S           = 86_400 * 7;  // 7 days
const SEEN_EVENT_TTL_S           = 86_400 * 2;  // 2 days

/**
 * Minimum block confirmations required before a replayed event is enqueued.
 * Live WebSocket events are enqueued immediately; the TransactionConfirmationWorker
 * then gates completion on this threshold. For replay (getLogs), we skip events
 * that are too recent so they re-appear on the next replay once confirmed.
 */
const CONFIRMATIONS_REQUIRED = 2;

const LOG_CTX = 'BlockchainListenerService';

// ─── Types ─────────────────────────────────────────────────────────────────────

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

interface ParsedTransfer {
  txHash:      string;
  logIndex:    number;
  blockNumber: number;
  from:        string;
  to:          string;
  value:       bigint;
}

// ─── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class BlockchainListenerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  // Ingestion resources keyed by chain
  private providers       = new Map<string, ethers.Provider>();
  private contracts       = new Map<string, ethers.Contract>();
  private reconnectTimers = new Map<string, NodeJS.Timeout>();

  // Leader election resources keyed by chain
  private leaderStates    = new Map<string, 'active' | 'standby'>();
  private renewalTimers   = new Map<string, NodeJS.Timeout>();
  private standbyTimers   = new Map<string, NodeJS.Timeout>();

  // RPC pool: current index per chain (wraps around resolveRpcUrls())
  private rpcPoolIndices  = new Map<string, number>();

  constructor(
    private readonly config:      ConfigService,
    private readonly leader:      LeaderElectionService,
    private readonly redis:       RedisService,
    @InjectQueue(QUEUE_NAMES.BLOCKCHAIN_EVENTS)
    private readonly eventsQueue: Queue,
    @Inject(WINSTON_MODULE_PROVIDER)
    private readonly logger:      WinstonLogger,
  ) {}

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

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
    for (const [chain, state] of this.leaderStates) {
      if (state === 'active') {
        await this.leader.release(chain).catch(() => {});
      }
    }

    for (const timer of this.renewalTimers.values())   clearInterval(timer);
    for (const timer of this.standbyTimers.values())   clearInterval(timer);
    for (const timer of this.reconnectTimers.values()) clearTimeout(timer);

    this.renewalTimers.clear();
    this.standbyTimers.clear();
    this.reconnectTimers.clear();

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

  // ─── Leader State Transitions ────────────────────────────────────────────────

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

  // ─── Renewal ─────────────────────────────────────────────────────────────────

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

  // ─── Standby Probe ───────────────────────────────────────────────────────────

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
        this.logger.error(`[${chain}] Standby probe error`, {
          context: LOG_CTX,
          error:   (err as Error).message,
        });
      }
    }, this.leader.standbyProbeIntervalMs);

    this.standbyTimers.set(chain, timer);
  }

  private clearStandbyTimer(chain: string): void {
    const t = this.standbyTimers.get(chain);
    if (t) { clearInterval(t); this.standbyTimers.delete(chain); }
  }

  // ─── Chain Teardown ──────────────────────────────────────────────────────────

  private teardownChain(chain: string): void {
    const reconnect = this.reconnectTimers.get(chain);
    if (reconnect) { clearTimeout(reconnect); this.reconnectTimers.delete(chain); }

    const contract = this.contracts.get(chain);
    if (contract) { contract.removeAllListeners().catch(() => {}); this.contracts.delete(chain); }

    const provider = this.providers.get(chain);
    if (provider) { (provider as any).destroy?.(); this.providers.delete(chain); }
  }

  // ─── RPC Pool ────────────────────────────────────────────────────────────────

  private resolveRpcUrls(chain: string): string[] {
    const primary =
      this.config.get<string>(RPC_ENV_KEYS[chain] ?? '') ||
      this.config.get<string>(`${chain}_RPC_URL`) ||
      this.config.get<string>('POLYGON_RPC_URL') ||
      this.config.get<string>('RPC_URL') ||
      this.config.get<string>('BLOCKCHAIN_RPC_URL') ||
      process.env[RPC_ENV_KEYS[chain] ?? ''] ||
      process.env[`${chain}_RPC_URL`] ||
      process.env.POLYGON_RPC_URL ||
      process.env.RPC_URL ||
      process.env.BLOCKCHAIN_RPC_URL;

    const urls: string[] = primary ? [primary] : [];

    for (const fb of RPC_PUBLIC_FALLBACKS[chain] ?? []) {
      if (!urls.includes(fb)) urls.push(fb);
    }

    return urls;
  }

  private currentRpcUrl(chain: string): string {
    const urls = this.resolveRpcUrls(chain);
    const idx  = this.rpcPoolIndices.get(chain) ?? 0;
    return urls[idx % Math.max(1, urls.length)] ?? '';
  }

  private rotateRpc(chain: string): void {
    const urls    = this.resolveRpcUrls(chain);
    if (urls.length <= 1) return;
    const current = this.rpcPoolIndices.get(chain) ?? 0;
    const next    = (current + 1) % urls.length;
    this.rpcPoolIndices.set(chain, next);
    this.logger.warn(`[${chain}] Rotating RPC provider`, {
      context: LOG_CTX,
      from:    this.maskUrl(urls[current]),
      to:      this.maskUrl(urls[next]),
    });
  }

  // ─── RPC Retry ───────────────────────────────────────────────────────────────

  private async withRpcRetry<T>(
    chain:   string,
    fn:      () => Promise<T>,
    retries  = RPC_RETRY_COUNT,
  ): Promise<T> {
    let lastErr: unknown;

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        const msg      = err instanceof Error ? err.message : String(err);
        const retryable = /503|SERVER_ERROR|timeout|ETIMEDOUT|ECONNRESET|rate.limit/i.test(msg);

        if (!retryable) throw err;

        const delay = 1_000 * (attempt + 1);
        this.logger.warn(`[${chain}] Transient RPC error (attempt ${attempt + 1}/${retries})`, {
          context:  LOG_CTX,
          error:    msg,
          provider: this.maskUrl(this.currentRpcUrl(chain)),
          retryIn:  `${delay}ms`,
        });

        await new Promise<void>((r) => setTimeout(r, delay));
      }
    }

    throw lastErr;
  }

  // ─── Redis: Last-Block Persistence ───────────────────────────────────────────

  private lastBlockKey(chain: string): string {
    return `listener:lastblock:${chain.toLowerCase()}`;
  }

  private async loadLastBlock(chain: string): Promise<number> {
    try {
      const val = await this.redis.client.get(this.lastBlockKey(chain));
      return val ? parseInt(val, 10) : 0;
    } catch {
      return 0;
    }
  }

  private async saveLastBlock(chain: string, block: number): Promise<void> {
    try {
      await this.redis.client.setex(this.lastBlockKey(chain), LAST_BLOCK_TTL_S, String(block));
    } catch { /* non-critical — BullMQ idempotency is the safety net */ }
  }

  // ─── Redis: Event Deduplication ──────────────────────────────────────────────

  private seenKey(txHash: string, logIndex: number): string {
    return `listener:seen:${txHash}:${logIndex}`;
  }

  /**
   * Atomically mark this event as seen.
   * Returns true  → first time we've seen it (enqueue it).
   * Returns false → already seen (skip).
   * Falls back to true on Redis failure so no events are silently dropped.
   */
  private async checkAndMarkSeen(txHash: string, logIndex: number): Promise<boolean> {
    try {
      const result = await this.redis.client.set(
        this.seenKey(txHash, logIndex), '1', 'EX', SEEN_EVENT_TTL_S, 'NX',
      );
      return result === 'OK';
    } catch {
      return true;
    }
  }

  // ─── Ingestion ───────────────────────────────────────────────────────────────

  private async startListening(chain: string, attempt: number): Promise<void> {
    if (this.leaderStates.get(chain) !== 'active') return;

    // On reconnect attempts, rotate to the next RPC in the pool
    if (attempt > 0) this.rotateRpc(chain);

    const rpcUrl = this.currentRpcUrl(chain);

    const usdcAddress =
      USDC_CONTRACTS[chain] ||
      this.config.get<string>('USDC_ADDRESS') ||
      this.config.get<string>('USDC_CONTRACT_ADDRESS') ||
      this.config.get<string>('BLOCKCHAIN_CONTRACT_ADDR') ||
      process.env.USDC_ADDRESS ||
      process.env.USDC_CONTRACT_ADDRESS ||
      '';

    if (!rpcUrl) {
      this.logger.error(`[${chain}] Cannot start listener: no RPC URL found`, {
        context: LOG_CTX,
        tried:   [RPC_ENV_KEYS[chain], `${chain}_RPC_URL`, 'POLYGON_RPC_URL', 'RPC_URL', 'BLOCKCHAIN_RPC_URL'],
      });
      return;
    }
    if (!usdcAddress) {
      this.logger.error(`[${chain}] Cannot start listener: USDC contract address not configured`, {
        context: LOG_CTX,
      });
      return;
    }

    try {
      const provider: ethers.Provider = rpcUrl.startsWith('wss://')
        ? new ethers.WebSocketProvider(rpcUrl)
        : new ethers.JsonRpcProvider(rpcUrl);

      // ── Replay missed events before subscribing ────────────────────────────
      const currentBlock = await this.withRpcRetry(chain, () => provider.getBlockNumber());
      const storedBlock  = await this.loadLastBlock(chain);
      const replayFrom   = storedBlock > 0
        ? Math.max(0, storedBlock - 5)
        : Math.max(0, currentBlock - RECONNECT_LOOKBACK_BLOCKS);

      if (replayFrom < currentBlock) {
        await this.replayEvents(chain, provider, usdcAddress, replayFrom, currentBlock - 1);
      }

      // ── Subscribe for live events ──────────────────────────────────────────
      const contract = new ethers.Contract(usdcAddress, ERC20_TRANSFER_ABI, provider);
      contract.on('Transfer', async (_from, _to, _value, payload) => {
        await this.handleTransferEvent(chain, _from, _to, _value, payload);
      });

      // Attach WS close/error handlers
      if (rpcUrl.startsWith('wss://')) {
        const ws = (provider as ethers.WebSocketProvider).websocket as any;
        ws?.on?.('error', (err: Error) => {
          this.logger.error(`[${chain}] WebSocket error`, {
            context: LOG_CTX,
            error:   err.message,
          });
          if (this.leaderStates.get(chain) === 'active') {
            this.teardownChain(chain);
            this.scheduleReconnect(chain, attempt);
          }
        });
        ws?.on?.('close', () => {
          this.logger.warn(`[${chain}] WebSocket closed — scheduling reconnect`, {
            context: LOG_CTX,
          });
          if (this.leaderStates.get(chain) === 'active') {
            this.teardownChain(chain);
            this.scheduleReconnect(chain, attempt);
          }
        });
      }

      this.providers.set(chain, provider);
      this.contracts.set(chain, contract);

      this.logger.info(`[${chain}] Listener active`, {
        context:      LOG_CTX,
        usdcAddress,
        rpcUrl:       this.maskUrl(rpcUrl),
        currentBlock,
        replayFrom,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[${chain}] Listener failed to start (attempt ${attempt})`, {
        context:  LOG_CTX,
        error:    msg,
        provider: this.maskUrl(rpcUrl),
      });
      if (this.leaderStates.get(chain) === 'active') {
        this.scheduleReconnect(chain, attempt);
      }
    }
  }

  private scheduleReconnect(chain: string, attempt: number): void {
    const delay = Math.min(2_000 * 2 ** attempt, MAX_RECONNECT_DELAY_MS);
    this.logger.info(`[${chain}] Reconnect in ${delay}ms (attempt ${attempt + 1})`, {
      context: LOG_CTX,
    });

    const timer = setTimeout(async () => {
      this.reconnectTimers.delete(chain);
      if (this.leaderStates.get(chain) === 'active') {
        await this.startListening(chain, attempt + 1);
      }
    }, delay);

    this.reconnectTimers.set(chain, timer);
  }

  // ─── Replay (getLogs catch-up in chunks) ─────────────────────────────────────

  private async replayEvents(
    chain:       string,
    provider:    ethers.Provider,
    usdcAddress: string,
    fromBlock:   number,
    toBlock:     number,
  ): Promise<void> {
    const iface  = new ethers.Interface(ERC20_TRANSFER_ABI);
    const filter = {
      address: usdcAddress,
      topics:  [ethers.id('Transfer(address,address,uint256)')],
    };

    let replayed = 0;

    for (let start = fromBlock; start <= toBlock; start += MAX_LOGS_CHUNK_BLOCKS) {
      const end = Math.min(start + MAX_LOGS_CHUNK_BLOCKS - 1, toBlock);

      try {
        const logs = await this.withRpcRetry(chain, () =>
          provider.getLogs({ ...filter, fromBlock: start, toBlock: end }),
        );

        for (const log of logs) {
          const parsed = iface.parseLog({
            topics: log.topics as string[],
            data:   log.data,
          });
          if (!parsed) continue;

          // Pass the chunk end-block so processTransfer can gate on confirmations
          await this.processTransfer(chain, {
            txHash:      log.transactionHash,
            logIndex:    log.index,
            blockNumber: log.blockNumber,
            from:        parsed.args[0] as string,
            to:          parsed.args[1] as string,
            value:       parsed.args[2] as bigint,
          }, end);
          replayed++;
        }
      } catch (err) {
        this.logger.warn(`[${chain}] Replay getLogs ${start}–${end} failed`, {
          context:  LOG_CTX,
          error:    (err as Error).message,
          provider: this.maskUrl(this.currentRpcUrl(chain)),
        });
      }
    }

    if (replayed > 0 || fromBlock < toBlock) {
      this.logger.info(`[${chain}] Replay complete`, {
        context:  LOG_CTX,
        fromBlock,
        toBlock,
        replayed,
      });
    }
  }

  // ─── Live Event Handler ──────────────────────────────────────────────────────

  /**
   * ethers v6: contract.on() passes ContractEventPayload as the last argument.
   * Decoded args arrive before the payload. The underlying Log is at payload.log.
   * Live events are enqueued immediately; the TransactionConfirmationWorker gates
   * completion on CONFIRMATIONS_REQUIRED.
   */
  private async handleTransferEvent(
    chain:   string,
    _from:   string,
    _to:     string,
    _value:  bigint,
    payload: ethers.ContractEventPayload,
  ): Promise<void> {
    const log    = payload?.log;
    const txHash = log?.transactionHash;

    if (!txHash) {
      this.logger.error(`[${chain}] Missing txHash in Transfer event`, {
        context: LOG_CTX,
        args:    String(payload?.args),
      });
      return;
    }

    const from  = (payload?.args?.from  ?? payload?.args?.[0] ?? _from)  as string;
    const to    = (payload?.args?.to    ?? payload?.args?.[1] ?? _to)    as string;
    const value = (payload?.args?.value ?? payload?.args?.[2] ?? _value) as bigint;

    if (!to || value === undefined) {
      this.logger.warn(`[${chain}] Invalid Transfer event — missing to/value`, {
        context: LOG_CTX,
        txHash,
        to,
        value:   value?.toString(),
      });
      return;
    }

    this.logger.debug(`[${chain}] RAW live event`, {
      context:     LOG_CTX,
      txHash,
      logIndex:    log?.index ?? 0,
      blockNumber: log?.blockNumber ?? 0,
      from:        String(from),
      to:          String(to),
      value:       value?.toString(),
    });

    // Live events: no currentBlock passed → confirmation check skipped here;
    // the TransactionConfirmationWorker handles the threshold after enqueue.
    await this.processTransfer(chain, {
      txHash,
      logIndex:    log?.index ?? 0,
      blockNumber: log?.blockNumber ?? 0,
      from,
      to,
      value,
    });
  }

  // ─── Common Transfer Processor ───────────────────────────────────────────────

  /**
   * Single enqueue path for both live events and getLogs replay.
   *
   * @param currentBlock  The chain tip at the time of detection (replay only).
   *   When provided, events that have not yet reached CONFIRMATIONS_REQUIRED blocks
   *   are skipped WITHOUT being marked as seen, so the next replay will retry them.
   *   Live WebSocket events omit this parameter and are always enqueued immediately.
   */
  private async processTransfer(
    chain:        string,
    data:         ParsedTransfer,
    currentBlock?: number,
  ): Promise<void> {
    const { txHash, logIndex, blockNumber, from, to, value } = data;

    if (!txHash) {
      this.logger.error(`[${chain}] Missing txHash — dropping event`, {
        context:     LOG_CTX,
        blockNumber,
        logIndex,
      });
      return;
    }

    // ── Confirmation gate (replay only) ───────────────────────────────────────
    // Do NOT mark seen yet — if we bail here the next replay will retry once the
    // block depth is sufficient.
    if (currentBlock !== undefined && blockNumber > 0) {
      if (blockNumber + CONFIRMATIONS_REQUIRED > currentBlock) {
        this.logger.info(`[${chain}] Waiting for confirmations`, {
          context:     LOG_CTX,
          txHash,
          logIndex,
          eventBlock:  blockNumber,
          currentBlock,
          required:    CONFIRMATIONS_REQUIRED,
        });
        return;
      }
    }

    // ── Deduplication ─────────────────────────────────────────────────────────
    const isNew = await this.checkAndMarkSeen(txHash, logIndex);
    if (!isNew) {
      this.logger.debug(`[${chain}] Duplicate Transfer skipped`, {
        context: LOG_CTX,
        txHash,
        logIndex,
      });
      return;
    }

    // ── Build event payload ───────────────────────────────────────────────────
    const jobId = `transfer-${chain}-${txHash}-${logIndex}`;

    const eventPayload: BlockchainTransferEvent = {
      chain,
      txHash,
      blockNumber,
      logIndex,
      fromAddress: from?.toLowerCase?.() ?? '',
      toAddress:   to.toLowerCase(),
      amountRaw:   value.toString(),
      timestamp:   Math.floor(Date.now() / 1000),
    };

    // ── Enqueue ───────────────────────────────────────────────────────────────
    try {
      await this.eventsQueue.add('process_transfer', eventPayload, {
        ...QUEUE_JOB_OPTIONS.blockchainEvents,
        jobId,
      });

      this.logger.info(`[${chain}] Transfer detected`, {
        context:     LOG_CTX,
        txHash,
        logIndex,
        from:        eventPayload.fromAddress,
        to:          eventPayload.toAddress,
        value:       value.toString(),
        blockNumber,
      });

      if (blockNumber > 0) {
        await this.saveLastBlock(chain, blockNumber);
      }
    } catch (err) {
      this.logger.error(`[${chain}] Failed to enqueue Transfer job`, {
        context: LOG_CTX,
        jobId,
        txHash,
        error:   err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ─── Utilities ───────────────────────────────────────────────────────────────

  /** Mask API keys embedded in RPC URLs for safe logging. */
  private maskUrl(url: string): string {
    return url.replace(/\/v2\/[^/?\s]+/, '/v2/***');
  }
}
