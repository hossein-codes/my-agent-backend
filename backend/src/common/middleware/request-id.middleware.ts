import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';

const HEADER = 'x-request-id';

/**
 * Assigns a request id to every request and echoes it back.
 *
 * The id is the correlation key across the access log, error log and the
 * client-visible error body — so a user reporting a failure can hand us one
 * string and we can find the exact request.
 *
 * An inbound `x-request-id` is reused (truncated, sanitized) so a trace can
 * span the load balancer; otherwise a fresh UUIDv4 is generated.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.headers[HEADER];
    const raw = Array.isArray(incoming) ? incoming[0] : incoming;
    const id = raw && /^[A-Za-z0-9._-]{1,64}$/.test(raw) ? raw : randomUUID();
    req.requestId = id;
    res.setHeader(HEADER, id);
    next();
  }
}
