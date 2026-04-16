/**
 * Audit Log Interceptor (hardened)
 *
 * Records ALL mutating operations (POST/PUT/PATCH/DELETE) to the audit log.
 * Captures: who, what, when, after state, IP address.
 *
 * Hardening changes vs original:
 *   1. Sensitive fields are redacted before storage (password, privateKey, etc.)
 *   2. Audit failures emit a metric counter instead of silently disappearing
 *   3. Response body is size-capped at MAX_BODY_CHARS to prevent giant blobs
 *      from inflating the audit table
 *   4. withoutTenantScope() wraps the audit write so the interceptor
 *      cannot accidentally apply row-level tenant filtering to the AuditLog table
 *
 * Applied as a route-level interceptor (not globally) to avoid performance
 * overhead on read-heavy endpoints.
 *
 * Usage: @UseInterceptors(AuditLogInterceptor) on controllers or methods
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { BusinessMetricsService } from '../../core/metrics/business-metrics.service';

const MUTABLE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const MAX_BODY_CHARS   = 8_000; // max chars stored in before/after columns

// Fields that must never appear in audit storage — redacted to '[REDACTED]'
const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'privateKey',
  'mnemonic',
  'seedPhrase',
  'cvv',
  'ssn',
  'apiKey',
  'apiSecret',
  'accessToken',
  'refreshToken',
  'secret',
  'pin',
]);

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: BusinessMetricsService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const { method, url, headers, ip } = request;
    const user = (request as any).user as { id?: string; tenantId?: string } | undefined;

    if (!MUTABLE_METHODS.has(method) || !user?.tenantId) {
      return next.handle();
    }

    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: async (responseData: unknown) => {
          try {
            const action = this.deriveAction(method, url);
            const { entityType, entityId } = this.extractEntityInfo(url, responseData);
            const sanitized = this.redactAndCap(
              method !== 'DELETE'
                ? (responseData as any)?.data ?? responseData
                : undefined,
            );

            await this.prisma.withoutTenantScope(() =>
              this.prisma.auditLog.create({
                data: {
                  tenantId:  user.tenantId!,
                  userId:    user.id,
                  action,
                  entityType,
                  entityId,
                  after:     method !== 'DELETE' ? sanitized as Prisma.InputJsonValue : undefined,
                  before:    method === 'DELETE'  ? sanitized as Prisma.InputJsonValue : undefined,
                  ipAddress: (headers['x-forwarded-for'] as string | undefined)
                               ?.split(',')[0]
                               ?.trim() ?? ip,
                  userAgent: headers['user-agent'],
                  metadata: {
                    method,
                    path:     url,
                    duration: Date.now() - startedAt,
                  },
                },
              }),
            );
          } catch (auditErr) {
            // Audit failures must NEVER affect the response already sent.
            // Increment a metric so Grafana can alert when audit is broken.
            this.metrics.recordDlqAlert('audit_log', false);
            this.logger.error(
              `Audit log write failed (non-fatal): ${auditErr instanceof Error ? auditErr.message : String(auditErr)}`,
            );
          }
        },
      }),
    );
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private redactAndCap(data: unknown): unknown {
    if (data === null || data === undefined) return data;

    let json: string;
    try {
      json = JSON.stringify(data, (_key, value) => {
        if (typeof _key === 'string' && SENSITIVE_KEYS.has(_key.toLowerCase())) {
          return '[REDACTED]';
        }
        return value;
      });
    } catch {
      return '[UNSERIALIZABLE]';
    }

    if (json.length > MAX_BODY_CHARS) {
      return { _truncated: true, _originalLength: json.length, preview: json.slice(0, MAX_BODY_CHARS) };
    }

    try {
      return JSON.parse(json);
    } catch {
      return json;
    }
  }

  private deriveAction(method: string, url: string): string {
    const pathParts = url.split('/').filter(Boolean);
    const resource = pathParts[2] ?? 'unknown'; // api/v1/{resource}/...

    const methodActionMap: Record<string, string> = {
      POST:   'created',
      PUT:    'updated',
      PATCH:  'updated',
      DELETE: 'deleted',
    };

    return `${resource}.${methodActionMap[method] ?? 'mutated'}`;
  }

  private extractEntityInfo(
    url: string,
    responseData: unknown,
  ): { entityType?: string; entityId?: string } {
    const pathParts = url.split('/').filter(Boolean);
    const resource  = pathParts[2]; // api/v1/{resource}
    const entityId  =
      pathParts[3] ??
      (responseData as any)?.data?.id ??
      (responseData as any)?.id;

    return {
      entityType: resource?.toUpperCase(),
      entityId,
    };
  }
}
