/**
 * OpenTelemetry SDK Bootstrap
 *
 * MUST be imported FIRST in main.ts — before any NestJS / Prisma / ioredis
 * imports — so the auto-instrumentations can patch the modules at require time.
 *
 * Instrumentations active:
 *   - HTTP (all inbound Express requests + outbound http/https calls)
 *   - NestJS core (controller/guard/interceptor spans)
 *   - PostgreSQL (via pg driver — captures Prisma queries)
 *   - ioredis (Redis calls — cache hits, BullMQ operations)
 *
 * Exporter:
 *   OTLP HTTP → Grafana Tempo (or any OTLP-compatible backend)
 *   Default endpoint: http://localhost:4318/v1/traces
 *   Override: OTEL_EXPORTER_OTLP_ENDPOINT env var
 *
 * Tenant context:
 *   Every span produced by HttpInstrumentation.requestHook includes
 *   crm.tenant_id so traces can be filtered per tenant in Grafana.
 *
 * Trace propagation across BullMQ:
 *   When enqueuing, call injectTraceContext(job.data) to embed W3C traceparent.
 *   When processing, call extractTraceContext(job.data) before handler logic.
 *   See DomainEventBus for the enqueue side; BullMQ workers for the extract side.
 *
 * Disable tracing: set OTEL_SDK_DISABLED=true
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { SimpleSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
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
const endpoint   = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318/v1/traces';

// Set W3C trace context as the global propagator (for cross-service / cross-queue linking)
propagation.setGlobalPropagator(new W3CTraceContextPropagator());

let sdk: NodeSDK | null = null;

if (!isDisabled) {
  const exporter = isDev && !process.env.OTEL_EXPORTER_OTLP_ENDPOINT
    ? new ConsoleSpanExporter()          // dev: log to console
    : new OTLPTraceExporter({ url: endpoint }); // prod: send to Tempo/Jaeger

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [SEMRESATTRS_SERVICE_NAME]:    process.env.OTEL_SERVICE_NAME ?? 'crm-backend',
      [SEMRESATTRS_SERVICE_VERSION]: process.env.APP_VERSION       ?? '0.0.0',
      'deployment.environment':      process.env.NODE_ENV          ?? 'development',
    }),

    spanProcessors: [
      new SimpleSpanProcessor(exporter),
    ],

    instrumentations: [
      new HttpInstrumentation({
        // Attach tenantId to every inbound HTTP span
        requestHook: (span, req) => {
          const httpReq = req as any;
          // tenantId is set by TenantContextMiddleware — may not be present at span creation time
          // Best-effort enrichment: if available on the req object already, add it
          const tenantId = httpReq.user?.tenantId ?? httpReq.headers?.['x-tenant-id'];
          if (tenantId) span.setAttribute('crm.tenant_id', tenantId);
        },
        // Don't trace health checks — they'd flood the trace backend
        ignoreIncomingRequestHook: (req) => {
          const url = (req as any).url ?? '';
          return url.includes('/health') || url === '/metrics';
        },
      }),
      new NestInstrumentation(),
      new PgInstrumentation({
        // Capture query text (truncated to avoid PII leakage from user-provided values)
        enhancedDatabaseReporting: false,
      }),
      new IORedisInstrumentation(),
    ],
  });

  sdk.start();
  console.log(`[OTel] Tracing started → ${isDev && !process.env.OTEL_EXPORTER_OTLP_ENDPOINT ? 'console' : endpoint}`);
}

// ─── Helpers for BullMQ trace propagation ────────────────────────────────────

/**
 * Inject the current trace context into a job data payload.
 * Call this when enqueuing a BullMQ job to link the async worker span
 * to the HTTP request span that triggered it.
 *
 * Example:
 *   await queue.add('myJob', injectTraceContext({ ...jobData }));
 */
export function injectTraceContext<T extends Record<string, unknown>>(data: T): T & { _otel: Record<string, string> } {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  return { ...data, _otel: carrier };
}

/**
 * Extract and restore the trace context from a job data payload.
 * Call this at the TOP of a BullMQ worker's process() method.
 *
 * Example:
 *   async process(job: Job) {
 *     return context.with(extractTraceContext(job.data), async () => {
 *       // all spans created here are children of the original HTTP span
 *       await this.doWork(job);
 *     });
 *   }
 */
export function extractTraceContext(data: Record<string, unknown>): ReturnType<typeof context.active> {
  const carrier = (data._otel as Record<string, string> | undefined) ?? {};
  return propagation.extract(context.active(), carrier);
}

process.on('SIGTERM', async () => {
  if (sdk) {
    await sdk.shutdown();
    console.log('[OTel] SDK shut down cleanly');
  }
});
