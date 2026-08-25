import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { AppConfigService } from '../../config/app-config.service';

/**
 * Single `PrismaClient` for the whole process.
 *
 * Query logging is derived from LOG_LEVEL so production does not drown in
 * SQL. Connection errors surface as 503 via the global filter rather than
 * crashing the process.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Prisma');

  constructor(private readonly config: AppConfigService) {
    super({
      adapter: new PrismaPg({ connectionString: config.databaseUrl }),
      log:
        config.nodeEnv === 'development'
          ? [{ emit: 'event', level: 'query' }, { emit: 'stdout', level: 'warn' }, { emit: 'stdout', level: 'error' }]
          : [{ emit: 'stdout', level: 'error' }],
    });
  }

  async onModuleInit(): Promise<void> {
    if (this.config.nodeEnv === 'development') {
      // `any` is unavoidable for Prisma's event emitter payload.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this as any).$on('query', (e: { query: string; params: string; duration: number }) => {
        if (e.duration > 200) this.logger.debug(`slow query ${e.duration}ms: ${e.query}`);
      });
    }
    await this.$connect();
    this.logger.log('connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
