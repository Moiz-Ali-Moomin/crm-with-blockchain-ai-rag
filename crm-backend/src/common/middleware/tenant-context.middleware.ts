/**
 * Tenant Context Middleware
 *
 * CRITICAL: Extracts tenantId from the validated JWT and stores it in
 * AsyncLocalStorage. This enables the PrismaService middleware to automatically
 * inject tenant scoping into every database query without requiring explicit
 * tenantId parameters in every repository call.
 *
 * AsyncLocalStorage is Node's native way to maintain request-scoped state
 * without prop-drilling through the entire call stack.
 */

import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { tenantContext, TenantContext } from '../../core/database/tenant-context';
import type { JwtPayload } from '../../shared/types/tenant.types';

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  use(req: Request, res: Response, next: NextFunction) {
    // Failsafe: skip tenant context for auth routes regardless of exclude pattern
    if (req.path.includes('/auth/') || req.path.endsWith('/auth')) {
      return next();
    }

    // Cookie-first (SSR/Frontend); fall back to Bearer header (API/Swagger)
    const token = req.cookies?.access_token || req.headers.authorization?.replace('Bearer ', '');
    const requestId = req.headers['x-request-id'] as string;

    if (!token) {
      // Some endpoints are public - let the JwtAuthGuard handle the rejection
      return tenantContext.run({ tenantId: '', requestId }, next);
    }

    try {
      const payload = this.jwtService.verify<JwtPayload>(
        token,
        { secret: this.config.get<string>('JWT_SECRET') },
      );

      if (!payload.tenantId) {
        throw new UnauthorizedException('Token missing tenant context');
      }

      // Store in AsyncLocalStorage - automatically propagates through async calls
      tenantContext.run(
        {
          tenantId: payload.tenantId,
          userId: payload.sub,
          requestId,
        },
        next,
      );
    } catch {
      // Invalid tokens are handled by the JWT guard downstream
      tenantContext.run({ tenantId: '', requestId }, next);
    }
  }
}

/**
 * Helper to get current tenant context outside of middleware
 * Returns null if called outside of a request context
 */
export function getCurrentTenantId(): string | null {
  return tenantContext.getStore()?.tenantId ?? null;
}

export function getCurrentUserId(): string | null {
  return tenantContext.getStore()?.userId ?? null;
}
