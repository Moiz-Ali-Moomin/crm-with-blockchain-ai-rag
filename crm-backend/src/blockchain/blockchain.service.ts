/**
 * EthereumProviderService
 *
 * Core abstraction over ethers.js v6 provider and signer management.
 *
 * Responsibilities:
 *   - Maintains a WebSocket provider (preferred) with exponential-backoff reconnect
 *   - Falls back transparently to HTTP when WS is not configured or currently down
 *   - Exposes a stable API: getProvider, getSigner, getBlockNumber, getLogs, sendTransaction
 *   - HTTP provider is always kept alive as the authoritative read/write path for workers
 *
 * Reconnect behaviour:
 *   WS drop → wsAlive = false → callers fall through to HTTP → background timer
 *   reconnects WS → wsAlive = true → callers switch back automatically.
 *   Delay: 2 s → 4 s → 8 s … capped at 60 s.
 *
 * Environment variables:
 *   RPC_URL      (required) — https:// JSON-RPC endpoint
 *   WS_RPC_URL   (optional) — wss:// endpoint; enables push-based subscriptions
 *   PRIVATE_KEY  (required for signing) — 0x-prefixed 32-byte hex
 */

import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';

const BASE_RECONNECT_MS = 2_000;
const MAX_RECONNECT_MS  = 60_000;

@Injectable()
export class EthereumProviderService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(EthereumProviderService.name);

  private _httpProvider:   ethers.JsonRpcProvider | null = null;
  private _wsProvider:     ethers.WebSocketProvider | null = null;
  private _signer:         ethers.Wallet | null = null;

  private _wsAlive         = false;
  private _reconnectTimer: NodeJS.Timeout | null = null;
  private _reconnectAttempt = 0;
  private _wsCleanups:     Array<() => void> = [];

  constructor(private readonly config: ConfigService) {}

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async onApplicationBootstrap(): Promise<void> {
    this.initHttpProvider();
    await this.initWsProvider(0);
  }

  async onApplicationShutdown(): Promise<void> {
    this.cancelReconnect();
    await this.teardownWs();
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Active provider — WS when connected, HTTP otherwise.
   * Never cache the returned instance; WS reconnects swap the underlying object.
   */
  getProvider(): ethers.Provider {
    if (this._wsAlive && this._wsProvider) return this._wsProvider;
    return this.requireHttp();
  }

  /**
   * The HTTP provider specifically — use for polling-based reads and all writes.
   * This is always stable regardless of WS state.
   */
  getHttpProvider(): ethers.JsonRpcProvider {
    return this.requireHttp();
  }

  /**
   * Custodial signer backed by the HTTP provider.
   * Lazy-initialised; reset when the HTTP provider is replaced.
   *
   * Throws if PRIVATE_KEY is not set (read-only deployments intentionally omit it).
   */
  getSigner(): ethers.Wallet {
    if (this._signer) return this._signer;
    const key = this.config.getOrThrow<string>('PRIVATE_KEY');
    this._signer = new ethers.Wallet(key, this.requireHttp());
    return this._signer;
  }

  async getBlockNumber(): Promise<number> {
    return this.getProvider().getBlockNumber();
  }

  /**
   * Query historical logs between fromBlock and toBlock.
   * Always uses HTTP — large log ranges can stall a WS connection.
   */
  async getLogs(
    filter: ethers.Filter,
    fromBlock: number | string,
    toBlock: number | string,
  ): Promise<ethers.Log[]> {
    return this.requireHttp().getLogs({ ...filter, fromBlock, toBlock });
  }

  /**
   * Sign and broadcast a transaction via the HTTP provider.
   * Returns immediately with the TransactionResponse — caller awaits receipt.
   */
  async sendTransaction(tx: ethers.TransactionRequest): Promise<ethers.TransactionResponse> {
    return this.getSigner().sendTransaction(tx);
  }

  /** True when the WebSocket connection is live and subscriptions are active. */
  get wsConnected(): boolean {
    return this._wsAlive;
  }

  // ─── HTTP Provider ─────────────────────────────────────────────────────────

  private initHttpProvider(): void {
    const url = this.config.getOrThrow<string>('RPC_URL');
    this._httpProvider = new ethers.JsonRpcProvider(url);
    this._signer = null; // reset so next call to getSigner picks up the new provider
    this.logger.log(`HTTP provider ready: ${url.replace(/\/\/.*@/, '//***@')}`);
  }

  private requireHttp(): ethers.JsonRpcProvider {
    if (!this._httpProvider) {
      throw new Error('EthereumProviderService: HTTP provider not initialised');
    }
    return this._httpProvider;
  }

  // ─── WebSocket Provider ────────────────────────────────────────────────────

  private async initWsProvider(attempt: number): Promise<void> {
    const wsUrl = this.config.get<string>('WS_RPC_URL');
    if (!wsUrl) {
      this.logger.warn('RPC_URL_WS not configured — operating in HTTP-only mode');
      this._wsAlive = false;
      return;
    }

    try {
      const ws = new ethers.WebSocketProvider(wsUrl);
      await ws.ready; // resolves once the handshake is complete

      this._wsProvider      = ws;
      this._wsAlive         = true;
      this._reconnectAttempt = 0;

      this.attachWsHandlers(ws, attempt);
      this.logger.log(
        `WebSocket provider connected (attempt ${attempt}): ${wsUrl.replace(/\/\/.*@/, '//***@')}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`WebSocket connect failed (attempt ${attempt}): ${msg} — using HTTP`);
      this._wsAlive = false;
      this.scheduleReconnect(attempt);
    }
  }

  private attachWsHandlers(ws: ethers.WebSocketProvider, attempt: number): void {
    // ethers v6 WebSocketProvider wraps the native WebSocket
    const raw = (ws as unknown as { websocket: WebSocket }).websocket;

    const onError = (evt: Event) => {
      const msg = (evt as ErrorEvent).message ?? 'unknown error';
      this.logger.error(`WebSocket error: ${msg}`);
      this._wsAlive = false;
      this.scheduleReconnect(this._reconnectAttempt++);
    };

    const onClose = () => {
      if (!this._wsAlive) return; // already handling a reconnect
      this.logger.warn('WebSocket closed — falling back to HTTP, reconnect scheduled');
      this._wsAlive = false;
      this.scheduleReconnect(this._reconnectAttempt++);
    };

    raw?.addEventListener?.('error', onError as EventListener);
    raw?.addEventListener?.('close', onClose as EventListener);

    this._wsCleanups = [
      () => raw?.removeEventListener?.('error', onError as EventListener),
      () => raw?.removeEventListener?.('close', onClose as EventListener),
    ];
  }

  private scheduleReconnect(attempt: number): void {
    this.cancelReconnect();
    const delay = Math.min(BASE_RECONNECT_MS * 2 ** attempt, MAX_RECONNECT_MS);
    this.logger.log(`WebSocket reconnect in ${delay}ms (attempt ${attempt + 1})`);

    this._reconnectTimer = setTimeout(async () => {
      this._reconnectTimer = null;
      await this.teardownWs();
      await this.initWsProvider(attempt + 1);
    }, delay);
  }

  private async teardownWs(): Promise<void> {
    this._wsCleanups.forEach((fn) => fn());
    this._wsCleanups = [];

    if (this._wsProvider) {
      try { await this._wsProvider.destroy(); } catch (_) { /* already dead */ }
      this._wsProvider = null;
    }
    this._wsAlive = false;
  }

  private cancelReconnect(): void {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }
}
