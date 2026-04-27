/**
 * DomainLogger
 *
 * A structured logger that automatically injects correlation context
 * (requestId, tenantId, correlationId) from AsyncLocalStorage into
 * every log call — without requiring callers to pass context manually.
 *
 * Usage in use-cases and domain services:
 *   constructor(private readonly logger: DomainLogger) {}
 *   this.logger.log('Deal created', { dealId });
 *
 * The context is injected by RequestIdMiddleware and TenantContextMiddleware.
 * Workers can set context manually via DomainLogger.setContext().
 */

import { Injectable, LoggerService } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Inject } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { getActiveTraceIds } from '../../observability/tracing';

export interface LogCorrelationContext {
  requestId?: string;
  tenantId?: string;
  correlationId?: string;
  userId?: string;
}

// Module-scoped ALS — shared across the application
export const correlationAls = new AsyncLocalStorage<LogCorrelationContext>();

@Injectable()
export class DomainLogger implements LoggerService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly winston: LoggerService,
  ) {}

  private getContext(): LogCorrelationContext {
    const { traceId, spanId } = getActiveTraceIds();
    return {
      ...correlationAls.getStore(),
      ...(traceId ? { traceId, spanId } : {}),
    };
  }

  log(message: string, meta?: Record<string, unknown>): void {
    (this.winston as any).log?.({ ...this.getContext(), ...meta, message });
  }

  error(message: string, trace?: string, meta?: Record<string, unknown>): void {
    (this.winston as any).error?.({ ...this.getContext(), ...meta, message, trace });
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    (this.winston as any).warn?.({ ...this.getContext(), ...meta, message });
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    (this.winston as any).debug?.({ ...this.getContext(), ...meta, message });
  }

  verbose(message: string, meta?: Record<string, unknown>): void {
    (this.winston as any).verbose?.({ ...this.getContext(), ...meta, message });
  }

  /**
   * Run a callback inside a correlation context.
   * Use in queue workers where there's no HTTP request context.
   */
  static withContext<T>(
    context: LogCorrelationContext,
    fn: () => T | Promise<T>,
  ): T | Promise<T> {
    return correlationAls.run(context, fn);
  }
}
