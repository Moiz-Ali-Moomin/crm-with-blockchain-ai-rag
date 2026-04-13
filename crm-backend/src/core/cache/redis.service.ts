/**
 * Redis Service - ioredis wrapper
 *
 * Provides typed get/set/del operations with:
 * - JSON serialization/deserialization
 * - Pattern-based cache invalidation
 * - Pipeline support for bulk operations
 */

import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  public readonly client: Redis;

  constructor(private readonly config: ConfigService) {
    this.client = new Redis(this.config.get<string>('REDIS_URL', 'redis://localhost:6379'), {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 10) return null; // Stop retrying after 10 attempts
        return Math.min(times * 100, 3000); // Exponential backoff capped at 3s
      },
    });

    this.client.on('error', (err) => {
      this.logger.error('Redis connection error', err.message);
    });

    this.client.on('reconnecting', () => {
      this.logger.warn('Redis reconnecting...');
    });
  }

  async onModuleInit() {
    try {
      await this.client.connect();
      this.logger.log('Redis connected');
    } catch (err) {
      // ioredis throws on first connect() if the server is unreachable.
      // We catch here so bootstrap completes — the 'error' event listener
      // above will keep logging reconnect attempts. Features that require
      // Redis (caching, BullMQ, JWT blacklist) will fail at call time, not
      // at startup, allowing /health/live to remain reachable.
      this.logger.error(
        `Redis initial connection failed — running without cache: ${(err as Error).message}`,
      );
    }
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  // ── Basic Operations ────────────────────────────────────────────────────────

  async get<T>(key: string): Promise<T | null> {
    const value = await this.client.get(key);
    if (value === null) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as unknown as T;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttlSeconds) {
      await this.client.setex(key, ttlSeconds, serialized);
    } else {
      await this.client.set(key, serialized);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    return (await this.client.exists(key)) === 1;
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.client.expire(key, ttlSeconds);
  }

  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  // ── Pattern-Based Invalidation ──────────────────────────────────────────────

  /**
   * Delete all keys matching a pattern.
   * Example: invalidateByPattern('leads:tenant:abc-123:*')
   * Uses SCAN to avoid blocking the server (unlike KEYS in production).
   */
  async invalidateByPattern(pattern: string): Promise<number> {
    let cursor = '0';
    let deleted = 0;

    do {
      const [nextCursor, keys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;

      if (keys.length > 0) {
        await this.client.del(...keys);
        deleted += keys.length;
      }
    } while (cursor !== '0');

    return deleted;
  }

  // ── Hash Operations (for session management) ───────────────────────────────

  async hset(key: string, field: string, value: string): Promise<void> {
    await this.client.hset(key, field, value);
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.client.hget(key, field);
  }

  async hdel(key: string, ...fields: string[]): Promise<void> {
    await this.client.hdel(key, ...fields);
  }

  // ── Set Operations (for blacklists) ───────────────────────────────────────

  async sadd(key: string, ...members: string[]): Promise<void> {
    await this.client.sadd(key, ...members);
  }

  async sismember(key: string, member: string): Promise<boolean> {
    return (await this.client.sismember(key, member)) === 1;
  }

  // ── Increment (for rate limiting, counters) ────────────────────────────────

  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async incrby(key: string, amount: number): Promise<number> {
    return this.client.incrby(key, amount);
  }
}
