/**
 * WithdrawalWorker
 *
 * Processes outbound USDC transfer jobs from the `withdrawals` queue.
 *
 * Flow:
 *   1. Redis idempotency check — if already processed, skip silently
 *   2. OTel span opened (linked to the enqueuing HTTP span via W3C traceparent)
 *   3. Call WalletsService.withdraw() which delegates to the custody provider
 *      (Fireblocks in prod, local HD wallet in dev)
 *   4. Mark idempotency key consumed in Redis (24 h TTL)
 *   5. Log result
 *
 * On final failure:
 *   @OnWorkerEvent('failed') pushes a structured DlqEntry to the dlq queue.
 *   The DLQ entry includes the full payload so ops can inspect and manually
 *   re-enqueue via POST /admin/jobs/retry.
 *
 * Idempotency contract:
 *   The caller MUST supply a stable `idempotencyKey` (e.g. UUID v4 generated
 *   at intent-creation time). The worker and the custody provider both use this
 *   key to guarantee the transfer is submitted exactly once even if the job
 *   is retried after a network error.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { trace, SpanStatusCode, context as otelContext } from '@opentelemetry/api';
import { QUEUE_NAMES, FINANCIAL_JOB_DEFAULTS } from '../../core/queue/queue.constants';
import { WalletsService } from '../../modules/wallets/wallets.service';
import { RedisService } from '../../core/cache/redis.service';
import { BusinessMetricsService } from '../../core/metrics/business-metrics.service';
import { DlqPublisherService } from '../services/dlq-publisher.service';
import { extractTraceContext } from '../../observability/tracing';

export interface WithdrawalJobPayload {
  tenantId: string;
  walletId: string;
  toAddress: string;
  amountUsdc: string;
  idempotencyKey: string;
  /** Passed through to OTel span for cross-service tracing */
  _otel?: Record<string, string>;
}

// How long to keep the idempotency flag in Redis (longer than max retry window)
const IDEMPOTENCY_TTL_SECONDS = 60 * 60 * 24; // 24 hours

const tracer = trace.getTracer('crm-backend');

@Injectable()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
@Processor(QUEUE_NAMES.WITHDRAWALS, { concurrency: 3 } as any)
export class WithdrawalWorker extends WorkerHost {
  private readonly logger = new Logger(WithdrawalWorker.name);

  constructor(
    private readonly walletsService: WalletsService,
    private readonly redis: RedisService,
    private readonly metrics: BusinessMetricsService,
    private readonly dlqPublisher: DlqPublisherService,
  ) {
    super();
  }

  async process(job: Job<WithdrawalJobPayload>): Promise<void> {
    return otelContext.with(extractTraceContext(job.data as unknown as Record<string, unknown>), () =>
      tracer.startActiveSpan('withdrawal.submit', async (span) => {
        const { tenantId, walletId, toAddress, amountUsdc, idempotencyKey } = job.data;

        span.setAttributes({
          'withdrawal.tenant_id':      tenantId,
          'withdrawal.wallet_id':      walletId,
          'withdrawal.amount_usdc':    amountUsdc,
          'withdrawal.idempotency_key': idempotencyKey,
          'job.name':                  job.name,
          'queue.name':                job.queueName,
        });

        try {
          // ── 1. Idempotency guard ────────────────────────────────────────────
          const idempKey = `withdrawal:processed:${idempotencyKey}`;
          if (await this.redis.exists(idempKey)) {
            this.logger.log(
              `Withdrawal ${idempotencyKey} already processed — skipping (idempotent)`,
            );
            span.setStatus({ code: SpanStatusCode.OK });
            return;
          }

          // ── 2. Submit to custody provider ───────────────────────────────────
          const result = await this.walletsService.withdraw(walletId, tenantId, {
            toAddress,
            amountUsdc,
            idempotencyKey,
          });

          // ── 3. Mark as processed in Redis ────────────────────────────────────
          await this.redis.set(idempKey, result.txHash ?? '1', IDEMPOTENCY_TTL_SECONDS);

          this.logger.log(
            `Withdrawal submitted: ${amountUsdc} USDC from wallet ${walletId} ` +
            `→ ${toAddress} | txHash: ${result.txHash}`,
          );

          span.setAttribute('withdrawal.tx_hash', result.txHash ?? '');
          span.setStatus({ code: SpanStatusCode.OK });
        } catch (err) {
          const error = err as Error;
          span.recordException(error);
          span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
          this.metrics.recordPaymentFailed(tenantId, 'withdrawal_error');
          throw err; // rethrow so BullMQ retries
        } finally {
          span.end();
        }
      }),
    );
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<WithdrawalJobPayload> | undefined, error: Error): Promise<void> {
    if (!job) return;
    await this.dlqPublisher.publishIfExhausted(job, error, true);
  }
}

/** Job options for enqueuing withdrawal jobs — re-export for producers. */
export const withdrawalJobOptions = (idempotencyKey: string) => ({
  ...FINANCIAL_JOB_DEFAULTS,
  jobId: `withdrawal-${idempotencyKey}`, // deduplicates duplicate enqueue calls
});
