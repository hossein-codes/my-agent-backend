import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCodes, type ErrorCode } from './error-codes';

/**
 * The single application error type.
 *
 * Every error that reaches a client is an `AppError` (or is converted into one
 * by the global filter). The wire shape is stable and deliberately small:
 *
 * ```json
 * { "code": "auth.otp_invalid", "message": "Human readable", "details": {...}, "requestId": "..." }
 * ```
 *
 * The frontend keys off `code`, never off `message` (messages are not
 * localized and may change).
 *
 * Extends `HttpException` so Nest's built-in handling still applies for
 * anything that bypasses our filter, but the filter is the real formatter.
 */
export class AppError extends HttpException {
  constructor(
    public readonly code: ErrorCode | string,
    public readonly statusCode: number,
    message: string,
    public readonly details?: Record<string, unknown>,
    public readonly innerCause?: unknown,
  ) {
    super(message, statusCode);
    this.name = 'AppError';
  }

  /** Convenience for `err instanceof AppError` checks across module boundaries. */
  static isAppError(value: unknown): value is AppError {
    return value instanceof AppError;
  }

  // --- 4xx factories ---------------------------------------------------------

  static badRequest(message = 'Bad request', code: string = ErrorCodes.VALIDATION_ERROR, details?: Record<string, unknown>): AppError {
    return new AppError(code, HttpStatus.BAD_REQUEST, message, details);
  }

  static unauthorized(message = 'Authentication required', code: string = ErrorCodes.UNAUTHORIZED): AppError {
    return new AppError(code, HttpStatus.UNAUTHORIZED, message);
  }

  /** Use 403 for "authenticated but not allowed", 401 for "not authenticated". */
  static forbidden(message = 'You do not have access to this resource', code: string = ErrorCodes.FORBIDDEN): AppError {
    return new AppError(code, HttpStatus.FORBIDDEN, message);
  }

  /**
   * 404 is also used to hide the existence of resources the caller may not
   * access (never leak "exists but not yours").
   */
  static notFound(message = 'Resource not found', code: string = ErrorCodes.NOT_FOUND): AppError {
    return new AppError(code, HttpStatus.NOT_FOUND, message);
  }

  static conflict(message = 'Resource conflicts with existing state', code: string = ErrorCodes.CONFLICT, details?: Record<string, unknown>): AppError {
    return new AppError(code, HttpStatus.CONFLICT, message, details);
  }

  /** 422 — the request is well-formed but semantically rejected by a business rule. */
  static unprocessable(message: string, code: string = ErrorCodes.VALIDATION_ERROR, details?: Record<string, unknown>): AppError {
    return new AppError(code, HttpStatus.UNPROCESSABLE_ENTITY, message, details);
  }

  static tooManyRequests(message = 'Too many requests', code: string = ErrorCodes.RATE_LIMITED, retryAfterSeconds?: number): AppError {
    return new AppError(code, HttpStatus.TOO_MANY_REQUESTS, message, retryAfterSeconds !== undefined ? { retryAfterSeconds } : undefined);
  }

  // --- 5xx -------------------------------------------------------------------

  /**
   * 500s never carry internal detail to the client. `innerCause` is logged
   * server-side by the filter and stripped from the response.
   */
  static internal(message = 'An unexpected error occurred', cause?: unknown): AppError {
    return new AppError(ErrorCodes.INTERNAL, HttpStatus.INTERNAL_SERVER_ERROR, message, undefined, cause);
  }

  static serviceUnavailable(message = 'Service temporarily unavailable'): AppError {
    return new AppError(ErrorCodes.SERVICE_UNAVAILABLE, HttpStatus.SERVICE_UNAVAILABLE, message);
  }
}
