'use strict';

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');

// ---- Config from env ----
const endpoint =
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
  'http://crm_otel_collector:4318/v1/traces';

// ---- Exporter ----
const traceExporter = new OTLPTraceExporter({
  url: endpoint,
});

// ---- SDK ----
const sdk = new NodeSDK({
  traceExporter,
  instrumentations: [getNodeAutoInstrumentations()],
});

// ---- Start ----
sdk
  .start()
  .then(() => {
    console.log(`[OTEL] started → ${endpoint}`);
  })
  .catch((err) => {
    console.error('[OTEL] failed to start', err);
  });

// ---- Graceful shutdown ----
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