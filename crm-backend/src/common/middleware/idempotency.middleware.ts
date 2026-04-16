/**
 * IdempotencyMiddleware
 *
 * Implements RFC-7230 idempotency key semantics for mutating HTTP operations.
 *
 * How it works:
 *   1. Client sends  Idempotency-Key: <uuid>  header on POST/PUT/PATCH requests.
 *   2. On first request: middleware is transparent — response is captured and
 *      stored in Redis under a tenant-scoped key (24h TTL).
 *   3. On subsequent requests with the same key: the cached response is
 *      replayed immediately — the handler is NOT called.
 *
 * Scope: per-tenant (prevents cross-tenant key collisions).
 * Only applied to POST/PUT/PATCH — idempotency is inherent on GET/DELETE.
 *
 * To enable: add to AppModule.configure() for specific route prefixes,
 * e.g. /api/v1/payments and /api/v1/deals.
 */

import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { RedisService } from '../../core/cache/redis.service';

const IDEMPOTENCY_TTL_SECONDS = 86_400; // 24 hours
const IDEMPOTENCY_LOCK_TTL_SECONDS = 30; // max time to hold lock while processing
const MUTABLE_METHODS = new Set(['POST', 'PUT', 'PATCH']);

@Injectable()
export class IdempotencyMiddleware implements NestMiddleware {
  private readonly logger = new Logger(IdempotencyMiddleware.name);

  constructor(private readonly redis: RedisService) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

    if (!idempotencyKey || !MUTABLE_METHODS.has(req.method)) {
      return next();
    }

    const user = (req as any).user as { tenantId?: string } | undefined;
    const tenantId = user?.tenantId ?? 'anon';

    const resultKey = `idempotency:result:${tenantId}:${idempotencyKey}`;
    const lockKey   = `idempotency:lock:${tenantId}:${idempotencyKey}`;

    // ── Check for a previously stored result ────────────────────────────────
    const cached = await this.redis.get<{ status: number; body: unknown }>(resultKey);

    if (cached !== null) {
      this.logger.debug(`Idempotency cache HIT: key=${idempotencyKey} tenant=${tenantId}`);
      res.setHeader('Idempotency-Replayed', 'true');
      res.status(cached.status).json(cached.body);
      return;
    }

    // ── Acquire a distributed lock to prevent concurrent duplicate requests ─
    const locked = await this.redis.client.set(
      lockKey,
      '1',
      'EX',
      IDEMPOTENCY_LOCK_TTL_SECONDS,
      'NX',
    );

    if (!locked) {
      // Another request with the same key is in-flight
      res.status(409).json({
        statusCode: 409,
        message: 'A request with this Idempotency-Key is already being processed. Retry after a moment.',
      });
      return;
    }

    // ── Intercept the response to cache it ───────────────────────────────────
    const originalJson = res.json.bind(res);
    res.json = (body: unknown): Response => {
      // Only cache successful responses
      if (res.statusCode < 400) {
        this.redis
          .set(resultKey, { status: res.statusCode, body }, IDEMPOTENCY_TTL_SECONDS)
          .catch((err: Error) =>
            this.logger.error(`Idempotency cache write failed: ${err.message}`),
          );
      }
      // Release the lock immediately — result is stored
      this.redis.del(lockKey).catch(() => undefined);
      return originalJson(body);
    };

    next();
  }
}
