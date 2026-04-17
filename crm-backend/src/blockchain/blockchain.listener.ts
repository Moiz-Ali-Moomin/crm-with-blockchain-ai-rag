/**
 * PaymentListenerService
 *
 * Real-time USDC Transfer event ingestion for the payment rail.
 *
 * Leader election (Redis SET NX):
 *   On startup each instance races for `listener_leader:{chain}` (TTL 30 s).
 *   Winner becomes ACTIVE and runs WS / HTTP polling.
 *   Loser becomes STANDBY: no subscriptions, no polling — only a lightweight
 *   probe loop that watches for the leader key to disappear, then re-races.
 *   Active instance renews its key every 10 s; if renewal fails it self-demotes
 *   to standby so the next standby probe can take over immediately.
 *
 * Mode override (LISTENER_MODE env var):
 *   active  — always active, bypass Redis election
 *   standby — always standby, bypass Redis election
 *   auto    — Redis election (default)
 *
 * WS ↔ HTTP fallback:
 *   1. WebSocket subscription (preferred) — zero-latency push events
 *   2. HTTP polling fallback — activated when WS is unavailable or drops
 *   3. Watchdog — upgrades back to WS every 30 s once WS is healthy
 *
 * Idempotency:
 *   jobId = `transfer:{txHash}:{logIndex}` — BullMQ drops duplicates silently.
 *
 * Environment variables:
 *   CHAIN_NAME           — label embedded in queued jobs (default: "ETHEREUM")
 *   POLLING_INTERVAL_MS  — HTTP poll cadence when WS is down (default: 12 000 ms)
 *   LISTENER_MODE        — active | standby | auto (default: auto)
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
import { EthereumProviderService } from './blockchain.service';
import { UsdcContractService } from './usdc.contract';
import { QUEUE_NAMES, QUEUE_JOB_OPTIONS } from '../core/queue/queue.constants';
import { LeaderElectionService } from '../core/leader/leader-election.service';

const SUBSCRIBE_LOOKBACK_BLOCKS  = 20;
const DEFAULT_POLL_INTERVAL_MS   = 12_000;
const MODE_WATCHDOG_INTERVAL_MS  = 30_000;
const MAX_LOGS_CHUNK_BLOCKS      = 500;   // Polygon Amoy getLogs limit
const RPC_RETRY_COUNT            = 3;
const LOG_CTX                    = 'PaymentListenerService';

export interface IncomingTransferJob {
  txHash:      string;
  blockNumber: number;
  logIndex:    number;
  fromAddress: string;
  toAddress:   string;
  /** USDC amount in atomic units (6 decimals), as a string for safe JSON transport */
  amountRaw:   string;
  chain:       string;
  /** Unix seconds — best-effort, used only for debugging */
  timestamp:   number;
}

type ListenerMode = 'ws' | 'polling' | 'idle';

@Injectable()
export class PaymentListenerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  // WS / polling state
  private _mode:            ListenerMode = 'idle';
  private _wsContract:      ethers.Contract | null = null;
  private _pollTimer:       NodeJS.Timeout | null = null;
  private _watchdogTimer:   NodeJS.Timeout | null = null;
  private _lastPolledBlock  = 0;

  // Leader election state
  private _leaderState:     'active' | 'standby' = 'standby';
  private _renewalTimer:    NodeJS.Timeout | null = null;
  private _standbyTimer:    NodeJS.Timeout | null = null;

  private readonly _chain:  string;
  private readonly _pollMs: number;

  constructor(
    private readonly provider:    EthereumProviderService,
    private readonly usdc:        UsdcContractService,
    private readonly config:      ConfigService,
    private readonly leader:      LeaderElectionService,
    @InjectQueue(QUEUE_NAMES.BLOCKCHAIN_EVENTS)
    private readonly eventsQueue: Queue,
    @Inject(WINSTON_MODULE_PROVIDER)
    private readonly logger:      WinstonLogger,
  ) {
    this._chain  = this.config.get<string>('CHAIN_NAME', 'ETHEREUM');
    this._pollMs = this.config.get<number>('POLLING_INTERVAL_MS', DEFAULT_POLL_INTERVAL_MS);
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async onApplicationBootstrap(): Promise<void> {
    const isActive = await this.leader.tryAcquire(this._chain);
    if (isActive) {
      await this.becomeActive();
    } else {
      this.becomeStandby();
    }
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopRenewal();
    this.stopStandbyProbe();
    this.stopWatchdog();
    this.stopPolling();
    await this.teardownWsSubscription();

    if (this._leaderState === 'active') {
      await this.leader.release(this._chain);
    }
  }

  // ─── Leader State Transitions ──────────────────────────────────────────────

  private async becomeActive(): Promise<void> {
    this._leaderState = 'active';
    this.stopStandbyProbe();
    await this.activateIngestion();
    this.startWatchdog();
    this.startRenewal();
  }

  private async becomeStandby(): Promise<void> {
    this._leaderState = 'standby';
    this.stopRenewal();
    this.stopWatchdog();
    this.stopPolling();
    await this.teardownWsSubscription();
    this._mode = 'idle';
    this.startStandbyProbe();
  }

  // ─── Renewal (active instances only) ──────────────────────────────────────

  private startRenewal(): void {
    this._renewalTimer = setInterval(async () => {
      const ok = await this.leader.renew(this._chain).catch(() => false);
      if (!ok) {
        await this.becomeStandby();
      }
    }, this.leader.renewIntervalMs);
  }

  private stopRenewal(): void {
    if (this._renewalTimer) {
      clearInterval(this._renewalTimer);
      this._renewalTimer = null;
    }
  }

  // ─── Standby Probe (standby instances only) ────────────────────────────────

  private startStandbyProbe(): void {
    this._standbyTimer = setInterval(async () => {
      if (this._leaderState !== 'standby') return;

      try {
        const absent = await this.leader.isLeaderAbsent(this._chain);
        if (!absent) return;

        const acquired = await this.leader.tryAcquire(this._chain);
        if (acquired) {
          await this.becomeActive();
        }
      } catch (err) {
        this.logger.error(`[${this._chain}] Standby probe error`, {
          context: LOG_CTX,
          error:   (err as Error).message,
        });
      }
    }, this.leader.standbyProbeIntervalMs);
  }

  private stopStandbyProbe(): void {
    if (this._standbyTimer) {
      clearInterval(this._standbyTimer);
      this._standbyTimer = null;
    }
  }

  // ─── Ingestion Activation ──────────────────────────────────────────────────

  private async activateIngestion(): Promise<void> {
    if (this.provider.wsConnected) {
      await this.startWsSubscription();
    } else {
      await this.startPolling();
    }
  }

  // ─── WebSocket Subscription ────────────────────────────────────────────────

  private async startWsSubscription(): Promise<void> {
    if (this._mode === 'ws') return;

    this.stopPolling();

    try {
      const currentBlock    = await this.provider.getBlockNumber();
      this._lastPolledBlock = Math.max(0, currentBlock - SUBSCRIBE_LOOKBACK_BLOCKS);

      const wsProvider   = this.provider.getProvider();
      this._wsContract   = this.usdc.getContract(wsProvider);
      this._mode         = 'ws';

      this._wsContract.on('Transfer', this.onWsTransfer.bind(this));

      this.logger.info(`[${this._chain}] WS subscription active`, {
        context:      LOG_CTX,
        usdcAddress:  this.usdc.contractAddress,
        fromBlock:    this._lastPolledBlock,
      });
    } catch (err) {
      this.logger.error(`[${this._chain}] WS subscription failed — starting HTTP polling`, {
        context: LOG_CTX,
        error:   (err as Error).message,
      });
      this._mode = 'idle';
      await this.startPolling();
    }
  }

  private async teardownWsSubscription(): Promise<void> {
    if (this._wsContract) {
      await this._wsContract.removeAllListeners('Transfer').catch(() => {});
      this._wsContract = null;
    }
  }

  /**
   * ethers v6: last arg is ContractEventPayload, not EventLog.
   * Decoded args arrive before the payload; the underlying Log is at payload.log.
   */
  private async onWsTransfer(
    _from:   string,
    _to:     string,
    _value:  bigint,
    payload: ethers.ContractEventPayload,
  ): Promise<void> {
    const log = payload?.log;

    const from  = (payload?.args?.from  ?? payload?.args?.[0] ?? _from)  as string;
    const to    = (payload?.args?.to    ?? payload?.args?.[1] ?? _to)    as string;
    const value = (payload?.args?.value ?? payload?.args?.[2] ?? _value) as bigint;

    const txHash   = log?.transactionHash;
    const logIndex = log?.index ?? 0;

    if (!txHash) {
      this.logger.error(`[${this._chain}] Missing txHash in Transfer event — skipping`, {
        context: LOG_CTX,
        args:    String(payload?.args),
      });
      return;
    }

    await this.enqueueTransfer({
      txHash,
      blockNumber: log?.blockNumber ?? 0,
      logIndex,
      fromAddress: from?.toLowerCase?.() ?? '',
      toAddress:   to.toLowerCase(),
      amountRaw:   value.toString(),
      chain:       this._chain,
      timestamp:   Math.floor(Date.now() / 1000),
    });
  }

  // ─── HTTP Polling Fallback ─────────────────────────────────────────────────

  private async startPolling(): Promise<void> {
    if (this._mode === 'polling') return;

    await this.teardownWsSubscription();

    try {
      this._lastPolledBlock = await this.provider.getBlockNumber();
    } catch (err) {
      this.logger.error(`[${this._chain}] Could not get current block for polling baseline`, {
        context: LOG_CTX,
        error:   (err as Error).message,
      });
      this._lastPolledBlock = 0;
    }

    this._mode = 'polling';
    this.logger.info(`[${this._chain}] HTTP polling active`, {
      context:    LOG_CTX,
      intervalMs: this._pollMs,
      fromBlock:  this._lastPolledBlock,
    });

    this.schedulePoll();
  }

  private stopPolling(): void {
    if (this._pollTimer) {
      clearTimeout(this._pollTimer);
      this._pollTimer = null;
    }
  }

  private schedulePoll(): void {
    this._pollTimer = setTimeout(async () => {
      this._pollTimer = null;
      if (this._mode !== 'polling') return;

      try {
        await this.pollNewBlocks();
      } catch (err) {
        this.logger.error(`[${this._chain}] Poll error`, {
          context: LOG_CTX,
          error:   (err as Error).message,
        });
      }

      if (this._mode === 'polling') this.schedulePoll();
    }, this._pollMs);
  }

  private async pollNewBlocks(): Promise<void> {
    const currentBlock = await this.withRetry(() => this.provider.getBlockNumber());
    if (currentBlock <= this._lastPolledBlock) return;

    const fromBlock = this._lastPolledBlock + 1;
    const toBlock   = currentBlock;
    const filter    = this.usdc.buildInboundTransferFilter();

    let totalLogs = 0;

    // Chunk getLogs to stay within Polygon Amoy's block-range limit
    for (let start = fromBlock; start <= toBlock; start += MAX_LOGS_CHUNK_BLOCKS) {
      const end = Math.min(start + MAX_LOGS_CHUNK_BLOCKS - 1, toBlock);

      let logs: Awaited<ReturnType<typeof this.provider.getLogs>>;
      try {
        logs = await this.withRetry(() => this.provider.getLogs(filter, start, end));
      } catch (err) {
        this.logger.error(`[${this._chain}] getLogs ${start}–${end} failed`, {
          context:  LOG_CTX,
          error:    (err as Error).message,
          fromBlock: start,
          toBlock:   end,
        });
        // Advance cursor so we don't re-poll on the same failing range
        this._lastPolledBlock = end;
        continue;
      }

      for (const log of logs) {
        const parsed = this.usdc.parseTransferEvent(log);
        if (!parsed) continue;

        await this.enqueueTransfer({
          txHash:      parsed.txHash,
          blockNumber: parsed.blockNumber,
          logIndex:    parsed.logIndex,
          fromAddress: parsed.from.toLowerCase(),
          toAddress:   parsed.to.toLowerCase(),
          amountRaw:   parsed.amountRaw,
          chain:       this._chain,
          timestamp:   Math.floor(Date.now() / 1000),
        });
        totalLogs++;
      }

      this._lastPolledBlock = end;
    }

    this.logger.debug(`[${this._chain}] Polled blocks ${fromBlock}–${toBlock}`, {
      context:    LOG_CTX,
      fromBlock,
      toBlock,
      logsFound:  totalLogs,
    });
  }

  /**
   * Retry wrapper for transient RPC errors (503, timeout, rate-limit).
   * Throws on the final attempt or on non-retryable errors.
   */
  private async withRetry<T>(fn: () => Promise<T>, retries = RPC_RETRY_COUNT): Promise<T> {
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
        this.logger.warn(`[${this._chain}] RPC transient error`, {
          context:  LOG_CTX,
          attempt:  `${attempt + 1}/${retries}`,
          retryIn:  `${delay}ms`,
          error:    msg,
        });
        await new Promise<void>((r) => setTimeout(r, delay));
      }
    }

    throw lastErr;
  }

  // ─── Mode Watchdog (WS ↔ HTTP) ────────────────────────────────────────────

  private startWatchdog(): void {
    this._watchdogTimer = setInterval(async () => {
      if (this._leaderState !== 'active') return;

      if (this._mode === 'polling' && this.provider.wsConnected) {
        this.logger.info(`[${this._chain}] WS back — upgrading from HTTP polling`, {
          context: LOG_CTX,
        });
        this._mode = 'idle';
        this.stopPolling();
        await this.startWsSubscription();
      } else if (this._mode === 'ws' && !this.provider.wsConnected) {
        this.logger.warn(`[${this._chain}] WS lost — downgrading to HTTP polling`, {
          context: LOG_CTX,
        });
        this._mode = 'idle';
        await this.teardownWsSubscription();
        await this.startPolling();
      }
    }, MODE_WATCHDOG_INTERVAL_MS);
  }

  private stopWatchdog(): void {
    if (this._watchdogTimer) {
      clearInterval(this._watchdogTimer);
      this._watchdogTimer = null;
    }
  }

  // ─── Queue Producer ────────────────────────────────────────────────────────

  private async enqueueTransfer(job: IncomingTransferJob): Promise<void> {
    const jobId = `transfer-${job.txHash}-${job.logIndex}`;

    try {
      await this.eventsQueue.add('process_transfer', job, {
        ...QUEUE_JOB_OPTIONS.blockchainEvents,
        jobId,
      });

      this.logger.info(`[${job.chain}] Transfer detected`, {
        context:     LOG_CTX,
        txHash:      job.txHash,
        logIndex:    job.logIndex,
        from:        job.fromAddress,
        to:          job.toAddress,
        amountRaw:   job.amountRaw,
        blockNumber: job.blockNumber,
      });
    } catch (err) {
      this.logger.error(`[${job.chain}] Failed to enqueue Transfer job`, {
        context: LOG_CTX,
        jobId,
        txHash:  job.txHash,
        error:   (err as Error).message,
      });
    }
  }
}
