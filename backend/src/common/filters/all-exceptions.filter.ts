import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { AppError } from '../errors/app-error';
import { ErrorCodes } from '../errors/error-codes';

/** The one and only error shape the frontend ever receives. */
export interface ErrorBody {
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
  timestamp: string;
}

/**
 * Global exception filter.
 *
 * Contracts it enforces:
 *   1. Every response is `{ code, message, details?, requestId, timestamp }` —
 *      the frontend switches on `code`, never on `message`.
 *   2. 5xx responses NEVER leak internals: the real error is logged with the
 *      request id, and the client gets a generic message.
 *   3. Prisma's well-known error codes are translated into domain codes so a
 *      constraint violation does not surface as an opaque 500.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const mapped = this.map(exception);

    if (mapped.status >= 500) {
      // Log the real cause server-side; correlate by request id.
      this.logger.error(
        `${request.method} ${request.originalUrl} → ${mapped.status} [${request.requestId ?? '-'}]: ${mapped.message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.debug(
        `${request.method} ${request.originalUrl} → ${mapped.status} ${mapped.code} [${request.requestId ?? '-'}]`,
      );
    }

    const body: ErrorBody = {
      code: mapped.code,
      message: mapped.status >= 500 ? 'An unexpected error occurred' : mapped.message,
      timestamp: new Date().toISOString(),
      requestId: request.requestId,
    };
    if (mapped.details !== undefined) body.details = mapped.details;

    if (mapped.retryAfterSeconds !== undefined) {
      response.setHeader('Retry-After', String(mapped.retryAfterSeconds));
    }

    response.status(mapped.status).json(body);
  }

  private map(exception: unknown): {
    status: number;
    code: string;
    message: string;
    details?: unknown;
    retryAfterSeconds?: number;
  } {
    if (exception instanceof AppError) {
      return {
        status: exception.statusCode,
        code: exception.code,
        message: exception.message,
        details: exception.details,
        retryAfterSeconds: (exception.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds,
      };
    }

    if (this.isPrismaKnownError(exception)) {
      return this.mapPrisma(exception);
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      // class-validator failures arrive as { message: string[], error: 'Bad Request' }
      if (status === HttpStatus.BAD_REQUEST && this.isValidationPayload(payload)) {
        return {
          status,
          code: ErrorCodes.VALIDATION_ERROR,
          message: 'Request validation failed',
          details: { errors: payload.message },
        };
      }
      return {
        status,
        code: this.codeForStatus(status),
        message: this.messageFromPayload(payload) ?? exception.message,
      };
    }

    return { status: HttpStatus.INTERNAL_SERVER_ERROR, code: ErrorCodes.INTERNAL, message: 'An unexpected error occurred' };
  }

  /** Nest may hand back a string or an arbitrary object as the response payload. */
  private messageFromPayload(payload: string | object): string | undefined {
    if (typeof payload === 'string') return payload;
    const m = (payload as { message?: unknown }).message;
    return typeof m === 'string' ? m : undefined;
  }

  private isValidationPayload(payload: unknown): payload is { message: string[] } {
    return (
      typeof payload === 'object' &&
      payload !== null &&
      Array.isArray((payload as { message?: unknown }).message)
    );
  }

  private isPrismaKnownError(e: unknown): e is { code: string; meta?: unknown } {
    return typeof e === 'object' && e !== null && typeof (e as { code?: unknown }).code === 'string'
      && /^P\d{4}$/.test((e as { code: string }).code);
  }

  /** Translate Prisma runtime errors into stable domain codes. */
  private mapPrisma(e: { code: string }): { status: number; code: string; message: string } {
    switch (e.code) {
      case 'P2002':
        return { status: HttpStatus.CONFLICT, code: ErrorCodes.CONFLICT, message: 'A record with these unique values already exists' };
      case 'P2025':
        return { status: HttpStatus.NOT_FOUND, code: ErrorCodes.NOT_FOUND, message: 'Record not found' };
      case 'P2003':
        return { status: HttpStatus.CONFLICT, code: ErrorCodes.CONFLICT, message: 'Referenced record does not exist' };
      case 'P2012':
        return { status: HttpStatus.UNPROCESSABLE_ENTITY, code: ErrorCodes.VALIDATION_ERROR, message: 'A database constraint was violated' };
      default:
        return { status: HttpStatus.INTERNAL_SERVER_ERROR, code: ErrorCodes.INTERNAL, message: 'Database error' };
    }
  }

  private codeForStatus(status: number): string {
    switch (status) {
      case HttpStatus.UNAUTHORIZED: return ErrorCodes.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN: return ErrorCodes.FORBIDDEN;
      case HttpStatus.NOT_FOUND: return ErrorCodes.NOT_FOUND;
      case HttpStatus.CONFLICT: return ErrorCodes.CONFLICT;
      case HttpStatus.TOO_MANY_REQUESTS: return ErrorCodes.RATE_LIMITED;
      case HttpStatus.PAYLOAD_TOO_LARGE: return ErrorCodes.PAYLOAD_TOO_LARGE;
      default: return status >= 500 ? ErrorCodes.INTERNAL : ErrorCodes.VALIDATION_ERROR;
    }
  }
}
