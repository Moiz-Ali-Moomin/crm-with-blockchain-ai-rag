/**
 * OpenTelemetry SDK Bootstrap
 *
 * MUST be imported FIRST in main.ts — before any NestJS / Prisma / ioredis
 * imports — so the auto-instrumentations can patch the modules at require time.
 *
 * Processor:
 *   BatchSpanProcessor — async, non-blocking, production-safe.
 *   Buffers spans in memory and exports them in batches (default every 5 s).
 *   SimpleSpanProcessor (the previous setting) blocks the event loop on every
 *   export; it is only safe for console debugging, never for production.
 *
 * Exporter:
 *   OTLP HTTP → OTEL Collector → Grafana Tempo
 *   Set OTEL_EXPORTER_OTLP_ENDPOINT to the collector's BASE url (no path):
 *     http://crm_otel_collector:4318
 *   The exporter auto-appends /v1/traces. Do NOT pass the full path — it
 *   bypasses the SDK's path-appending logic and sends to the wrong endpoint.
 *
 * Environment variables (all optional — safe defaults provided):
 *   OTEL_SDK_DISABLED            — set "true" to skip SDK init entirely
 *   OTEL_EXPORTER_OTLP_ENDPOINT  — base collector URL (default: http://localhost:4318)
 *   OTEL_SERVICE_NAME            — service name in traces (default: crm-backend)
 *   APP_VERSION                  — injected as service.version resource
 *   NODE_ENV                     — injected as deployment.environment resource
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { BatchSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { context, propagation, trace } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';

const isDisabled = process.env.OTEL_SDK_DISABLED === 'true';
const isDev      = process.env.NODE_ENV !== 'production';

// Use console exporter only in local dev with no collector configured.
// In production (or when OTEL_EXPORTER_OTLP_ENDPOINT is explicitly set),
// always send to the collector regardless of NODE_ENV.
const useConsole = isDev && !process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

// For logging only — the exporter reads OTEL_EXPORTER_OTLP_ENDPOINT itself.
const otlpBase = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318';

propagation.setGlobalPropagator(new W3CTraceContextPropagator());

let sdk: NodeSDK | null = null;

if (!isDisabled) {
  // OTLPTraceExporter with no options reads OTEL_EXPORTER_OTLP_ENDPOINT and
  // appends /v1/traces automatically — the correct OTEL spec behaviour.
  // Passing { url } directly would bypass this and requires the full path.
  const exporter = useConsole ? new ConsoleSpanExporter() : new OTLPTraceExporter();

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [SEMRESATTRS_SERVICE_NAME]:    process.env.OTEL_SERVICE_NAME ?? 'crm-backend',
      [SEMRESATTRS_SERVICE_VERSION]: process.env.APP_VERSION       ?? '0.0.0',
      'deployment.environment':      process.env.NODE_ENV          ?? 'development',
      'service.namespace':           'crm',
    }),

    // BatchSpanProcessor is non-blocking — it queues spans and exports them
    // asynchronously. The limits below match typical production workloads;
    // tune maxQueueSize up if you see "dropped spans" warnings in the logs.
    spanProcessors: [
      new BatchSpanProcessor(exporter, {
        maxQueueSize:         2048,
        maxExportBatchSize:   512,
        scheduledDelayMillis: 5_000,
        exportTimeoutMillis:  30_000,
      }),
    ],

    instrumentations: [
      new HttpInstrumentation({
        requestHook: (span, req) => {
          const httpReq = req as any;
          const tenantId = httpReq.user?.tenantId ?? httpReq.headers?.['x-tenant-id'];
          if (tenantId) span.setAttribute('crm.tenant_id', tenantId);
        },
        // Health and metrics endpoints generate high-frequency noise; exclude them.
        ignoreIncomingRequestHook: (req) => {
          const url = (req as any).url ?? '';
          return url.includes('/health') || url === '/metrics';
        },
      }),
      new NestInstrumentation(),
      new PgInstrumentation({
        // enhancedDatabaseReporting captures the full query string. Off by default
        // to avoid accidental PII leakage from parameterised user values.
        enhancedDatabaseReporting: false,
      }),
      new IORedisInstrumentation(),
    ],
  });

  try {
    sdk.start();
    const destination = useConsole ? 'console' : `${otlpBase}/v1/traces`;
    console.log(`[OTel] Tracing started → ${destination}`);
  } catch (err) {
    // A misconfigured collector or unavailable endpoint must not crash the app.
    // Log the failure and continue — the app runs without traces rather than failing.
    console.error('[OTel] SDK failed to start — tracing disabled:', err);
    sdk = null;
  }
}

// ─── BullMQ trace-context propagation ────────────────────────────────────────
//
// Traces don't cross async queue boundaries automatically. These two helpers
// bridge the HTTP-request span to the worker span by serialising the W3C
// traceparent header into the job payload.

/**
 * Embed the current trace context into a BullMQ job payload.
 * Call this when enqueuing so the worker can link its span to this request.
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
 * Call this at the top of process() and wrap your handler in context.with().
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
 * Safe to call even when tracing is disabled — returns empty strings.
 * Inject these into log entries to correlate logs with traces in Grafana.
 */
export function getActiveTraceIds(): { traceId: string; spanId: string } {
  const span = trace.getActiveSpan();
  if (!span) return { traceId: '', spanId: '' };
  const ctx = span.spanContext();
  return { traceId: ctx.traceId, spanId: ctx.spanId };
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

async function shutdownSdk(): Promise<void> {
  if (!sdk) return;
  try {
    await sdk.shutdown();
    console.log('[OTel] SDK shut down cleanly');
  } catch (err) {
    console.error('[OTel] Error during SDK shutdown:', err);
  }
}

// Docker sends SIGTERM on graceful stop; SIGINT on Ctrl-C in interactive sessions.
process.on('SIGTERM', shutdownSdk);
process.on('SIGINT',  shutdownSdk);
