import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Auth metadata + parameter decorators.
 *
 * The global `JwtAuthGuard` authenticates EVERY route unless it is marked
 * `@Public()`. `PermissionsGuard` then enforces `@Permissions(...)`.
 */

/** Marks a route as reachable without an access token. */
export const IS_PUBLIC_KEY = 'app:isPublic';
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);

/** Permission slugs required to reach a route (evaluated as an OR-set). */
export const PERMISSIONS_KEY = 'app:permissions';
export const Permissions = (...permissions: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** What `JwtAuthGuard` attaches to `request.user` after verifying the token. */
export interface AuthenticatedUser {
  userId: string;
  sessionId: string;
  roles: string[];
}

/**
 * Injects the authenticated principal.
 * Identity comes ONLY from the verified token — never from a body/query field.
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext): AuthenticatedUser | string | string[] => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) {
      // Unreachable in practice: non-public routes always pass JwtAuthGuard first.
      throw new Error('CurrentUser used on a route that was not authenticated');
    }
    return data ? user[data] : user;
  },
);
