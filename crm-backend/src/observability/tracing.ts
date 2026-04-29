/**
 * OTel trace-context helpers
 *
 * The SDK is initialised exclusively by otel.js (loaded with `node -r ./otel.js`
 * before main.js). This file exports only lightweight utilities that talk to
 * the OTel API layer — they work with whatever SDK was registered globally.
 *
 * Importing this file has no side effects.
 */

import { context, propagation, trace } from '@opentelemetry/api';

// ─── BullMQ trace-context propagation ────────────────────────────────────────
//
// Traces do not cross async queue boundaries automatically. Serialise the
// active W3C traceparent into the job payload when enqueuing so the worker
// can link its span back to the originating request.

/**
 * Embed the current trace context into a BullMQ job payload.
 *
 *   await queue.add('myJob', injectTraceContext({ ...jobData }));
 */
export function injectTraceContext<T extends Record<string, unknown>>(
  data: T,
): T & { _otel: Record<string, string> } {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  return { ...data, _otel: carrier };
}

/**
 * Restore a trace context from a BullMQ job payload.
 *
 *   async process(job: Job) {
 *     return context.with(extractTraceContext(job.data), () => this.doWork(job));
 *   }
 */
export function extractTraceContext(
  data: Record<string, unknown>,
): ReturnType<typeof context.active> {
  const carrier = (data._otel as Record<string, string> | undefined) ?? {};
  return propagation.extract(context.active(), carrier);
}

/**
 * Returns the traceId and spanId of the currently active OTel span.
 * Safe when tracing is disabled — returns empty strings.
 * Inject these into log entries to correlate logs ↔ traces in Grafana.
 */
export function getActiveTraceIds(): { traceId: string; spanId: string } {
  const span = trace.getActiveSpan();
  if (!span) return { traceId: '', spanId: '' };
  const ctx = span.spanContext();
  return { traceId: ctx.traceId, spanId: ctx.spanId };
}

/**
 * Record an error on the currently active span and re-rethrow it.
 * Use this in catch blocks to ensure exceptions are visible in Tempo.
 *
 *   catch (err) { recordError(err); throw err; }
 */
export function recordError(err: unknown): void {
  const span = trace.getActiveSpan();
  if (!span) return;
  span.recordException(err instanceof Error ? err : new Error(String(err)));
  span.setStatus({ code: 2 /* ERROR */ });
}
