import { AppError } from './app-error';
import { ErrorCodes } from './error-codes';

/**
 * The error envelope is the frontend's contract, so the status/code pairing of
 * every factory is pinned here. A silent change would break client-side
 * handling without any compile error.
 */
describe('AppError factories', () => {
  it.each([
    ['badRequest', 400, ErrorCodes.VALIDATION_ERROR],
    ['unauthorized', 401, ErrorCodes.UNAUTHORIZED],
    ['forbidden', 403, ErrorCodes.FORBIDDEN],
    ['notFound', 404, ErrorCodes.NOT_FOUND],
    ['conflict', 409, ErrorCodes.CONFLICT],
    ['unprocessable', 422, ErrorCodes.VALIDATION_ERROR],
    ['tooManyRequests', 429, ErrorCodes.RATE_LIMITED],
    ['serviceUnavailable', 503, ErrorCodes.SERVICE_UNAVAILABLE],
  ] as const)('%s() → %i / %s', (factory, status, code) => {
    const err = AppError[factory]('boom') as AppError;
    expect(err.statusCode).toBe(status);
    expect(err.code).toBe(code);
    expect(err).toBeInstanceOf(AppError);
  });

  it('lets a caller override the code while keeping the status', () => {
    const err = AppError.notFound('Nope', ErrorCodes.PRODUCT_NOT_FOUND);
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe(ErrorCodes.PRODUCT_NOT_FOUND);
  });

  it('carries retryAfterSeconds so the filter can set Retry-After', () => {
    const err = AppError.tooManyRequests('slow down', ErrorCodes.RATE_LIMITED, 42);
    expect(err.details).toEqual({ retryAfterSeconds: 42 });
  });

  it('keeps the cause of a 500 off the client-facing fields', () => {
    const err = AppError.internal('kaboom', new Error('secret stack details'));
    expect(err.statusCode).toBe(500);
    expect(err.details).toBeUndefined();
    // The real cause is preserved for logging, under a name that does not
    // collide with HttpException.cause.
    expect((err.innerCause as Error).message).toBe('secret stack details');
  });

  it('uses dotted snake_case codes the frontend can switch on', () => {
    for (const code of Object.values(ErrorCodes)) {
      expect(code).toMatch(/^[a-z_]+\.[a-z_]+$/);
    }
  });

  it('has no duplicate code strings across different keys', () => {
    const values = Object.values(ErrorCodes);
    expect(new Set(values).size).toBe(values.length);
  });
});
