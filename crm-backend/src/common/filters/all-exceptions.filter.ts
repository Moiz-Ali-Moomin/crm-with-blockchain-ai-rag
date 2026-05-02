/**
 * Global Exception Filter
 *
 * Catches ALL exceptions and formats them into a consistent API response.
 * Maps Prisma errors to meaningful HTTP status codes.
 * Logs errors with full context for debugging.
 */

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import {
  DomainError,
  NotFoundError,
  ConflictError,
  ValidationError,
  ForbiddenError,
  UnauthorizedError,
  BusinessRuleError,
} from '../../shared/errors/domain.errors';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const requestId = request.headers['x-request-id'] as string;
    const { status, message, errors } = this.mapException(exception);

    // Log based on severity
    if (status >= 500) {
      this.logger.error({
        message: `${request.method} ${request.url} → ${status}`,
        error: exception instanceof Error ? exception.message : String(exception),
        stack: exception instanceof Error ? exception.stack : undefined,
        requestId,
        userId: (request as any).user?.id,
        tenantId: (request as any).user?.tenantId,
      });
    } else if (status >= 400) {
      this.logger.warn({
        message: `${request.method} ${request.url} → ${status}: ${message}`,
        requestId,
      });
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      message,
      errors: errors ?? undefined,
      details: (exception instanceof HttpException && status === 503) ? exception.getResponse() : undefined,
      requestId,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }

  private mapException(exception: unknown): {
    status: number;
    message: string;
    errors?: Record<string, string[]>;
  } {
    // NestJS HTTP exceptions
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      return {
        status: exception.getStatus(),
        message: typeof response === 'string'
          ? response
          : (response as any).message ?? exception.message,
        errors: typeof response === 'object' ? (response as any).errors : undefined,
      };
    }

    // Domain errors — thrown by services, mapped to HTTP here
    if (exception instanceof DomainError) {
      return this.mapDomainError(exception);
    }

    // Zod validation errors
    if (exception instanceof ZodError) {
      const errors: Record<string, string[]> = {};
      exception.errors.forEach((err) => {
        const field = err.path.join('.');
        if (!errors[field]) errors[field] = [];
        errors[field].push(err.message);
      });
      return {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        message: 'Validation failed',
        errors,
      };
    }

    // Prisma errors - map to meaningful HTTP codes
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.mapPrismaError(exception);
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Invalid data provided',
      };
    }

    if (exception instanceof Prisma.PrismaClientInitializationError) {
      return {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        message: 'Database connection unavailable',
      };
    }

    // Unknown errors
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred'
        : String(exception instanceof Error ? exception.message : exception),
    };
  }

  private mapDomainError(exception: DomainError): {
    status: number;
    message: string;
    errors?: Record<string, string[]>;
  } {
    if (exception instanceof NotFoundError) {
      return { status: HttpStatus.NOT_FOUND, message: exception.message };
    }
    if (exception instanceof ConflictError) {
      return { status: HttpStatus.CONFLICT, message: exception.message };
    }
    if (exception instanceof ValidationError) {
      return {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        message: exception.message,
        errors: exception.errors,
      };
    }
    if (exception instanceof ForbiddenError) {
      return { status: HttpStatus.FORBIDDEN, message: exception.message };
    }
    if (exception instanceof UnauthorizedError) {
      return { status: HttpStatus.UNAUTHORIZED, message: exception.message };
    }
    if (exception instanceof BusinessRuleError) {
      return { status: HttpStatus.BAD_REQUEST, message: exception.message };
    }
    // Fallback for any other DomainError subclass
    return { status: HttpStatus.INTERNAL_SERVER_ERROR, message: exception.message };
  }

  private mapPrismaError(exception: Prisma.PrismaClientKnownRequestError): {
    status: number;
    message: string;
  } {
    switch (exception.code) {
      case 'P2002': {
        // Unique constraint violation
        const field = (exception.meta?.target as string[])?.join(', ') ?? 'field';
        return {
          status: HttpStatus.CONFLICT,
          message: `A record with this ${field} already exists`,
        };
      }
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          message: 'Record not found',
        };
      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Foreign key constraint failed - related record not found',
        };
      case 'P2014':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Cannot delete record - it has related records',
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Database error occurred',
        };
    }
  }
}
