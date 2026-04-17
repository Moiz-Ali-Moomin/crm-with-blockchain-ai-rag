/**
 * LeaderElectionService
 *
 * Distributed leader election using Redis SET NX for listener deduplication.
 *
 * Key schema:   listener_leader:{chain}   (e.g. listener_leader:ethereum)
 * Value:        instanceId  (hostname + UUID — unique per process)
 * TTL:          30 seconds
 * Renewal:      every 10 s via Lua CAS — only extends if we still own the key
 * Release:      Lua CAS delete on graceful shutdown
 *
 * LISTENER_MODE env override:
 *   auto    — Redis election (default)
 *   active  — always active, skip Redis entirely
 *   standby — always standby, skip Redis entirely
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hostname } from 'os';
import { randomUUID } from 'crypto';
import { RedisService } from '../cache/redis.service';

export type ListenerRole        = 'active' | 'standby';
export type ListenerModeConfig  = 'active' | 'standby' | 'auto';

const LEADER_TTL_S             = 30;
const RENEW_INTERVAL_MS        = 10_000;
const STANDBY_PROBE_INTERVAL_MS = 5_000;

/** Extend TTL only if the key still holds our instanceId */
const LUA_RENEW = `
  if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('expire', KEYS[1], ARGV[2])
  else
    return 0
  end
`;

/** Delete the key only if the key still holds our instanceId */
const LUA_RELEASE = `
  if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('del', KEYS[1])
  else
    return 0
  end
`;

@Injectable()
export class LeaderElectionService {
  private readonly logger = new Logger(LeaderElectionService.name);

  readonly instanceId: string;
  private readonly modeOverride: ListenerModeConfig;

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {
    this.instanceId   = `${hostname()}-${randomUUID()}`;
    this.modeOverride = (
      this.config.get<string>('LISTENER_MODE', 'auto') as ListenerModeConfig
    );

    if (this.modeOverride !== 'auto') {
      this.logger.log(
        `LeaderElection: LISTENER_MODE=${this.modeOverride} — Redis election bypassed`,
      );
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Attempt to acquire leadership for the given chain.
   *
   * Returns true  → this instance is now the active leader
   * Returns false → another instance holds the key; enter standby
   *
   * LISTENER_MODE=active  → always returns true  (no Redis I/O)
   * LISTENER_MODE=standby → always returns false (no Redis I/O)
   * LISTENER_MODE=auto    → atomic SET NX EX
   */
  async tryAcquire(chain: string): Promise<boolean> {
    if (this.modeOverride === 'active') {
      this.logger.log(`[${chain}] listener_active (LISTENER_MODE=active override)`);
      return true;
    }
    if (this.modeOverride === 'standby') {
      this.logger.log(`[${chain}] listener_standby (LISTENER_MODE=standby override)`);
      return false;
    }

    const key    = this.leaderKey(chain);
    const result = await this.redis.client.set(
      key, this.instanceId, 'EX', LEADER_TTL_S, 'NX',
    );

    if (result === 'OK') {
      this.logger.log(`[${chain}] leader_acquired — instance=${this.instanceId}`);
      this.logger.log(`[${chain}] listener_active`);
      return true;
    }

    const owner = await this.redis.client.get(key);
    this.logger.log(`[${chain}] listener_standby — current leader: ${owner ?? 'unknown'}`);
    return false;
  }

  /**
   * Renew leadership by extending the TTL (Lua CAS).
   * Returns false if we no longer own the key — caller should transition to standby.
   *
   * No-op and returns true when LISTENER_MODE != auto.
   */
  async renew(chain: string): Promise<boolean> {
    if (this.modeOverride !== 'auto') return true;

    const renewed = await this.redis.client.eval(
      LUA_RENEW, 1, this.leaderKey(chain), this.instanceId, String(LEADER_TTL_S),
    ) as number;

    if (renewed !== 1) {
      this.logger.warn(`[${chain}] leader_lost — key expired or stolen`);
      return false;
    }
    return true;
  }

  /**
   * Release leadership for graceful shutdown (Lua CAS delete).
   * No-op when LISTENER_MODE != auto.
   */
  async release(chain: string): Promise<void> {
    if (this.modeOverride !== 'auto') return;

    await this.redis.client.eval(
      LUA_RELEASE, 1, this.leaderKey(chain), this.instanceId,
    );
    this.logger.log(`[${chain}] leader_lost — released on shutdown`);
  }

  /**
   * Returns true if the leadership key is absent (TTL = -2).
   * Used by standby instances to decide when to attempt takeover.
   */
  async isLeaderAbsent(chain: string): Promise<boolean> {
    const ttl = await this.redis.client.ttl(this.leaderKey(chain));
    return ttl === -2;
  }

  get renewIntervalMs():        number { return RENEW_INTERVAL_MS; }
  get standbyProbeIntervalMs(): number { return STANDBY_PROBE_INTERVAL_MS; }

  // ── Internals ───────────────────────────────────────────────────────────────

  private leaderKey(chain: string): string {
    return `listener_leader:${chain.toLowerCase()}`;
  }
}
