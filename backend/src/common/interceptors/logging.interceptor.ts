import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

/**
 * Structured HTTP access logging (spec §33). Logs contain method, path,
 * status, duration and request id only — never bodies, headers or query
 * values that could carry sensitive data (spec §30).
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    // Health probes are high-frequency and sensitive-free; log at debug level.
    const isHealth = request.path?.includes('/health');

    if (isHealth) {
      return next.handle();
    }

    const start = Date.now();
    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - start;
        this.logger.log(
          `${request.method} ${request.originalUrl} ${response.statusCode} +${duration}ms [${request.requestId ?? '-'}]`,
        );
      }),
    );
  }
}
