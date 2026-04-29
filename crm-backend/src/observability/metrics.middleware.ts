import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { metrics, SpanStatusCode, trace } from '@opentelemetry/api';

// ─── Instruments ──────────────────────────────────────────────────────────────
// Meters and instruments are singletons — creating them at module load time
// ensures we always get the same instrument regardless of how many times
// NestJS instantiates this class.

const meter = metrics.getMeter('crm-api', process.env.APP_VERSION ?? '1.0.0');

// R — Rate: total requests, labelled by method / route / status
const httpRequestsTotal = meter.createCounter('http_requests_total', {
  description: 'Total HTTP requests received',
  unit:        '{request}',
});

// E — Errors: 4xx + 5xx requests broken out for alert rules
const httpErrorsTotal = meter.createCounter('http_errors_total', {
  description: 'Total HTTP error responses (status >= 400)',
  unit:        '{request}',
});

// D — Duration: latency distribution per route
const httpRequestDuration = meter.createHistogram('http_request_duration_seconds', {
  description: 'HTTP request latency',
  unit:        's',
  // Explicit boundaries keep Prometheus cardinality predictable and match
  // the default bucket set used by most community dashboards.
  advice: {
    explicitBucketBoundaries: [
      0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
    ],
  },
});

// Active in-flight requests gauge (useful for back-pressure monitoring)
const httpRequestsActive = meter.createUpDownCounter('http_requests_active', {
  description: 'Number of HTTP requests currently being processed',
  unit:        '{request}',
});

// ─── Middleware ───────────────────────────────────────────────────────────────

@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const startNs = process.hrtime.bigint();

    // Track concurrency
    httpRequestsActive.add(1);

    res.on('finish', () => {
      const durationS = Number(process.hrtime.bigint() - startNs) / 1e9;

      // Prefer the matched Express route pattern (e.g. /api/v1/leads/:id)
      // over the raw URL path to avoid high-cardinality metric labels.
      const route = (req as any).route?.path ?? req.path ?? 'unknown';

      const attrs: Record<string, string | number> = {
        'http.method':      req.method,
        'http.route':       route,
        'http.status_code': res.statusCode,
        'http.status_class': `${Math.floor(res.statusCode / 100)}xx`,
      };

      // Optional tenant dimension — present once TenantContextMiddleware runs
      const tenantId =
        (req as any).user?.tenantId ??
        (req.headers['x-tenant-id'] as string | undefined);
      if (tenantId) attrs['crm.tenant_id'] = tenantId;

      httpRequestsTotal.add(1, attrs);
      httpRequestDuration.record(durationS, attrs);
      httpRequestsActive.add(-1, { 'http.method': req.method });

      if (res.statusCode >= 400) {
        httpErrorsTotal.add(1, attrs);

        // Stamp the active span with error status so Tempo error rate panels
        // work without a separate log query.
        const span = trace.getActiveSpan();
        if (span && res.statusCode >= 500) {
          span.setStatus({ code: SpanStatusCode.ERROR });
        }
      }
    });

    next();
  }
}
