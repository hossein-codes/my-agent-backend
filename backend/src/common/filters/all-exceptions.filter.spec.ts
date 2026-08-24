import { BadRequestException, ForbiddenException, HttpException, HttpStatus } from '@nestjs/common';
import { AllExceptionsFilter, type ErrorBody } from './all-exceptions.filter';
import { AppError } from '../errors/app-error';
import { ErrorCodes } from '../errors/error-codes';

/**
 * The error envelope is the frontend's contract. Two rules matter most:
 *   1. a 5xx must never leak internals
 *   2. every response has the same shape, so the client has one error path
 */
function run(exception: unknown, requestId = 'req-1') {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const setHeader = jest.fn();
  const firstArg = <T,>(fn: jest.Mock): T => (fn.mock.calls[0] as unknown as [T])[0];
  const response = { status, json, setHeader };
  const request = { method: 'GET', originalUrl: '/api/v1/x', requestId };

  new AllExceptionsFilter().catch(exception, {
    switchToHttp: () => ({ getResponse: () => response, getRequest: () => request }),
  } as never);

  return { body: firstArg<ErrorBody>(json), statusCode: firstArg<number>(status), setHeader };
}

describe('AllExceptionsFilter', () => {
  it('renders an AppError with its own code and status', () => {
    const { body, statusCode } = run(AppError.notFound('Nope', ErrorCodes.PRODUCT_NOT_FOUND));
    expect(statusCode).toBe(404);
    expect(body.code).toBe(ErrorCodes.PRODUCT_NOT_FOUND);
    expect(body.message).toBe('Nope');
    expect(body.requestId).toBe('req-1');
    expect(typeof body.timestamp).toBe('string');
  });

  it('NEVER leaks the message of a 500 to the client', () => {
    const { body } = run(AppError.internal('internal detail', new Error('password=hunter2')));
    expect(body.code).toBe(ErrorCodes.INTERNAL);
    expect(body.message).not.toContain('password');
    expect(body.message).not.toContain('internal detail');
  });

  it('replaces the message of any unknown exception with a generic one', () => {
    const { body, statusCode } = run(new Error('SELECT * FROM users -- leaked schema'));
    expect(statusCode).toBe(500);
    expect(body.message).toBe('An unexpected error occurred');
    expect(body.message).not.toContain('SELECT');
  });

  it('turns class-validator failures into a single code plus a details list', () => {
    const { body, statusCode } = run(new BadRequestException(['phone must be E.164', 'code must be 6 digits']));
    expect(statusCode).toBe(400);
    expect(body.code).toBe(ErrorCodes.VALIDATION_ERROR);
    expect(body.details).toEqual({ errors: ['phone must be E.164', 'code must be 6 digits'] });
  });

  it.each([
    [new ForbiddenException(), 403, ErrorCodes.FORBIDDEN],
    [new HttpException('nope', HttpStatus.NOT_FOUND), 404, ErrorCodes.NOT_FOUND],
  ])('maps a stock Nest exception (%i) to a stable code', (exception, status, code) => {
    const { body, statusCode } = run(exception);
    expect(statusCode).toBe(status);
    expect(body.code).toBe(code);
  });

  it.each([
    ['P2002', 409, ErrorCodes.CONFLICT],
    ['P2025', 404, ErrorCodes.NOT_FOUND],
    ['P2003', 409, ErrorCodes.CONFLICT],
  ])('translates Prisma %s into a domain code instead of an opaque 500', (code, status, expected) => {
    const { body, statusCode } = run({ code, meta: {} });
    expect(statusCode).toBe(status);
    expect(body.code).toBe(expected);
  });

  it('sets Retry-After when the error carries a retry hint', () => {
    const { setHeader } = run(AppError.tooManyRequests('slow down', ErrorCodes.RATE_LIMITED, 30));
    expect(setHeader).toHaveBeenCalledWith('Retry-After', '30');
  });

  it('omits details when there are none, rather than sending null', () => {
    const { body } = run(AppError.notFound());
    expect('details' in body).toBe(false);
  });
});
