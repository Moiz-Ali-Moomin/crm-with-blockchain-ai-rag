'use strict';

/**
 * OpenTelemetry SDK Bootstrap (CJS preload)
 *
 * Loaded with:  node -r ./otel.js dist/src/main.js
 *
 * This file is the SINGLE source of truth for SDK initialisation.
 * tracing.ts (imported later by main.ts) only exports helper utilities;
 * it no longer starts its own SDK.
 *
 * Signal flow:
 *   App → OTLP/HTTP → otel-collector (crm_otel_collector:4318)
 *     traces  → Tempo
 *     metrics → Prometheus (remote_write)
 *     logs    → Loki
 *
 * Environment variables (all optional):
 *   OTEL_SDK_DISABLED            — "true" to skip SDK entirely
 *   OTEL_EXPORTER_OTLP_ENDPOINT  — collector base URL   (default: http://crm_otel_collector:4318)
 *   OTEL_SERVICE_NAME            — service.name attr     (default: crm-api)
 *   APP_VERSION                  — service.version attr  (default: 1.0.0)
 *   NODE_ENV                     — deployment.environment
 */

if (process.env.OTEL_SDK_DISABLED === 'true') {
  console.log('[OTEL] SDK disabled via OTEL_SDK_DISABLED=true');
  // Export a no-op so require('./otel') never throws
  module.exports = {};
  return;
}

const { NodeSDK }                        = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations }    = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter }              = require('@opentelemetry/exporter-trace-otlp-http');
const { OTLPMetricExporter }             = require('@opentelemetry/exporter-metrics-otlp-http');
const { OTLPLogExporter }                = require('@opentelemetry/exporter-logs-otlp-http');
const { PeriodicExportingMetricReader }  = require('@opentelemetry/sdk-metrics');
const { BatchLogRecordProcessor }        = require('@opentelemetry/sdk-logs');
const { BatchSpanProcessor }             = require('@opentelemetry/sdk-trace-base');
const { resourceFromAttributes }         = require('@opentelemetry/resources');

// ─── Endpoint resolution ──────────────────────────────────────────────────────
// Strip any /v1/xxx suffix so callers can set either the bare base URL or a
// full signal URL and we always reconstruct all three paths correctly.

const rawBase  = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://crm_otel_collector:4318';
const baseUrl  = rawBase.replace(/\/v1\/[^/]*\/?$/, '').replace(/\/$/, '');

const TRACE_URL   = `${baseUrl}/v1/traces`;
const METRICS_URL = `${baseUrl}/v1/metrics`;
const LOGS_URL    = `${baseUrl}/v1/logs`;

// ─── Resource ─────────────────────────────────────────────────────────────────

const resource = resourceFromAttributes({
  'service.name':           process.env.OTEL_SERVICE_NAME || 'crm-api',
  'service.version':        process.env.APP_VERSION       || '1.0.0',
  'service.namespace':      'crm',
  'deployment.environment': process.env.NODE_ENV          || 'production',
});

// ─── Instrumentation ──────────────────────────────────────────────────────────

const instrumentations = [
  getNodeAutoInstrumentations({
    // fs instrumentation generates thousands of spans per request — disable it.
    '@opentelemetry/instrumentation-fs': { enabled: false },

    '@opentelemetry/instrumentation-http': {
      enabled: true,
      // Health probes and the Prometheus scrape endpoint are high-frequency
      // noise. Suppress them to keep trace storage costs down.
      ignoreIncomingRequestHook: (req) => {
        const url = req.url || '';
        return (
          url.startsWith('/health') ||
          url === '/metrics'        ||
          url.startsWith('/api/v1/health')
        );
      },
      // Attach tenant context to every inbound span for cross-tenant filtering
      // in Grafana without needing extra log joins.
      requestHook: (span, req) => {
        const tenantId = req.headers && req.headers['x-tenant-id'];
        if (tenantId) span.setAttribute('crm.tenant_id', String(tenantId));
      },
    },

    '@opentelemetry/instrumentation-express': { enabled: true },

    '@opentelemetry/instrumentation-pg': {
      enabled: true,
      // enhancedDatabaseReporting captures full SQL. Keep off to avoid
      // accidental PII leakage from parameterised user values in production.
      enhancedDatabaseReporting: false,
    },

    '@opentelemetry/instrumentation-ioredis': { enabled: true },
  }),
];

// ─── SDK ──────────────────────────────────────────────────────────────────────

const sdk = new NodeSDK({
  resource,

  // Traces → BatchSpanProcessor → OTLP HTTP → collector → Tempo
  // Explicit batch config so we control queue depth and flush cadence rather
  // than relying on env-var defaults that differ across SDK versions.
  spanProcessors: [
    new BatchSpanProcessor(
      new OTLPTraceExporter({ url: TRACE_URL }),
      {
        maxQueueSize:         2048,
        maxExportBatchSize:   512,
        scheduledDelayMillis: 5_000,
        exportTimeoutMillis:  30_000,
      },
    ),
  ],

  // Metrics → PeriodicExportingMetricReader → OTLP HTTP → collector → Prometheus
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({ url: METRICS_URL }),
    exportIntervalMillis: 15_000,
    exportTimeoutMillis:  10_000,
  }),

  // Logs → BatchLogRecordProcessor → OTLP HTTP → collector → Loki
  // The OpenTelemetryTransportV3 Winston transport (wired in app.module.ts)
  // forwards each log record through the OTel Logs API into this pipeline.
  logRecordProcessors: [
    new BatchLogRecordProcessor(
      new OTLPLogExporter({ url: LOGS_URL }),
      {
        maxQueueSize:         512,
        maxExportBatchSize:   128,
        scheduledDelayMillis: 5_000,
        exportTimeoutMillis:  30_000,
      },
    ),
  ],

  instrumentations,
});

// ─── Start ────────────────────────────────────────────────────────────────────

try {
  sdk.start();
  console.log('[OTEL] SDK started');
  console.log(`[OTEL] traces  → ${TRACE_URL}`);
  console.log(`[OTEL] metrics → ${METRICS_URL}`);
  console.log(`[OTEL] logs    → ${LOGS_URL}`);
} catch (err) {
  // A misconfigured or unavailable collector must not crash the application.
  // The app runs without observability rather than failing to boot.
  console.error('[OTEL] SDK failed to start — observability disabled:', err);
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────
// Flush in-flight spans/metrics/logs before the process exits so we don't lose
// the tail of data during rolling deploys or Ctrl-C in dev.

async function shutdown() {
  try {
    await sdk.shutdown();
    console.log('[OTEL] shutdown complete');
  } catch (err) {
    console.error('[OTEL] shutdown error:', err);
  }
}

process.once('SIGTERM', () => shutdown().finally(() => process.exit(0)));
process.once('SIGINT',  () => shutdown().finally(() => process.exit(0)));
