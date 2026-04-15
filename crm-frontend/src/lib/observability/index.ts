/**
 * Observability Layer
 *
 * Thin, swap-friendly facade over console (dev) and future monitoring SDK.
 *
 * Design:
 *   - All observability calls go through this module
 *   - In production: swap the implementation to send to Sentry, Datadog, etc.
 *   - In dev: structured console output
 *   - Zero external dependencies at compile time
 *
 * Usage:
 *   import { observe } from '@/lib/observability';
 *   observe.error(error, { context: 'CreateDeal' });
 *   observe.apiLatency('/deals', 342);
 *   observe.userAction('deal_created', { dealId });
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ErrorContext {
  context?: string;
  userId?: string;
  tenantId?: string;
  requestId?: string;
  componentStack?: string;
  [key: string]: unknown;
}

export interface ApiLatencyEvent {
  url: string;
  method: string;
  durationMs: number;
  status: number;
  requestId?: string;
}

export interface UserActionEvent {
  action: string;
  data?: unknown;
}

// ─── Implementation ───────────────────────────────────────────────────────────

const isDev = process.env.NODE_ENV === 'development';

function captureError(error: Error, context: ErrorContext = {}) {
  if (isDev) {
    console.group(`[observe:error] ${context.context ?? 'Unknown'}`);
    console.error(error);
    if (Object.keys(context).length > 0) console.table(context);
    console.groupEnd();
  }

  // ── Production hook ──────────────────────────────────────────────────────
  // Example (uncomment when Sentry is configured):
  //
  // import * as Sentry from '@sentry/nextjs';
  // Sentry.captureException(error, { extra: context });
}

function captureApiLatency(event: ApiLatencyEvent) {
  if (isDev && event.durationMs > 1_000) {
    // Only log slow requests in dev
    console.warn(`[observe:slow-api] ${event.method.toUpperCase()} ${event.url} — ${event.durationMs}ms`);
  }

  // ── Production hook ──────────────────────────────────────────────────────
  // Example (Datadog RUM):
  // datadogRum.addAction('api_call', event);
}

function captureUserAction(action: string, data?: unknown) {
  if (isDev) {
    console.debug(`[observe:action] ${action}`, data ?? '');
  }

  // ── Production hook ──────────────────────────────────────────────────────
  // Example (Segment, Mixpanel):
  // analytics.track(action, data);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const observe = {
  error: (error: Error, context?: ErrorContext) => captureError(error, context),

  apiLatency: (
    url: string,
    method: string,
    durationMs: number,
    status: number,
    requestId?: string,
  ) => captureApiLatency({ url, method, durationMs, status, requestId }),

  userAction: (action: string, data?: unknown) => captureUserAction(action, data),
} as const;
