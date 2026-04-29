'use strict';

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-http');
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const { BatchLogRecordProcessor } = require('@opentelemetry/sdk-logs');
const { resourceFromAttributes } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');

// ─────────────────────────────────────────
// Base collector endpoint
// ─────────────────────────────────────────
const base =
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
  'http://crm_otel_collector:4318';

const traceEndpoint = base.endsWith('/v1/traces') ? base : base + '/v1/traces';
const metricsEndpoint = base.replace(/\/v1\/traces$/, '') + '/v1/metrics';
const logsEndpoint = base.replace(/\/v1\/traces$/, '') + '/v1/logs';

// ─────────────────────────────────────────
// Service metadata
// ─────────────────────────────────────────
const resource = resourceFromAttributes({
  [SemanticResourceAttributes.SERVICE_NAME]:
    process.env.OTEL_SERVICE_NAME || 'crm-api',
  [SemanticResourceAttributes.SERVICE_VERSION]:
    process.env.APP_VERSION || '1.0.0',
  'deployment.environment': process.env.NODE_ENV || 'production',
});

// ─────────────────────────────────────────
// SDK setup — traces + metrics + logs
// ─────────────────────────────────────────
const sdk = new NodeSDK({
  resource,

  traceExporter: new OTLPTraceExporter({ url: traceEndpoint }),

  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({ url: metricsEndpoint }),
    exportIntervalMillis: 15000,
  }),

  logRecordProcessor: new BatchLogRecordProcessor(
    new OTLPLogExporter({ url: logsEndpoint }),
  ),

  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-http': {
        enabled: true,
        ignoreIncomingPaths: [],
      },
      '@opentelemetry/instrumentation-express': {
        enabled: true,
      },
      '@opentelemetry/instrumentation-ioredis': {
        enabled: true,
      },
      '@opentelemetry/instrumentation-pg': {
        enabled: true,
      },
    }),
  ],
});

// ─────────────────────────────────────────
// Start SDK BEFORE app boots
// ─────────────────────────────────────────
try {
  sdk.start();
  console.log(`[OTEL] traces  → ${traceEndpoint}`);
  console.log(`[OTEL] metrics → ${metricsEndpoint}`);
  console.log(`[OTEL] logs    → ${logsEndpoint}`);
} catch (err) {
  console.error('[OTEL] failed to start', err);
}

// ─────────────────────────────────────────
// Graceful shutdown
// ─────────────────────────────────────────
process.on('SIGTERM', async () => {
  try {
    await sdk.shutdown();
    console.log('[OTEL] shutdown complete');
  } catch (e) {
    console.error('[OTEL] shutdown error', e);
  } finally {
    process.exit(0);
  }
});
