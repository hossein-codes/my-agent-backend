import type { AuthenticatedUser } from '../common/decorators/auth.decorators';

/**
 * Augment Express's `Request` with the fields this app attaches in middleware
 * and guards. Without this, `request.user` / `request.requestId` are type
 * errors under `strict`.
 */
declare global {
  namespace Express {
    interface Request {
      /** Set by `JwtAuthGuard` after the access token is verified. */
      user?: AuthenticatedUser;
      /** Set by the request-id middleware; echoed back in `x-request-id`. */
      requestId?: string;
    }
  }
}

export {};
