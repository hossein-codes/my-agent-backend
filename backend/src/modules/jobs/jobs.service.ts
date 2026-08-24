import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { InventoryService } from '../inventory/inventory.service';
import { OrderService } from '../orders/order.service';

interface Job {
  name: string;
  intervalMs: number;
  run: () => Promise<unknown>;
}

/**
 * In-process scheduler for housekeeping.
 *
 * Deliberately tiny and deliberately in-process: these jobs are idempotent and
 * safe to run on several instances at once, so a distributed scheduler would be
 * complexity without benefit. If any of them ever becomes non-idempotent, it
 * must move behind a Redis lock first.
 *
 * Every job is wrapped so a failure is logged and the next tick still happens —
 * one bad run must not silently stop the sweep forever.
 */
@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Jobs');
  private readonly timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly config: AppConfigService,
    private readonly inventory: InventoryService,
    private readonly orders: OrderService,
  ) {}

  private get jobs(): Job[] {
    return [
      {
        // Releases stock held by carts that were never paid for.
        name: 'inventory.release-expired-reservations',
        intervalMs: 60_000,
        run: () => this.inventory.expireStaleReservations(),
      },
      {
        // Cancels orders whose payment window closed, freeing their stock.
        name: 'orders.expire-unpaid',
        intervalMs: 5 * 60_000,
        run: () => this.orders.expireUnpaidOrders(),
      },
    ];
  }

  onModuleInit(): void {
    // Tests and short-lived scripts should not start background timers.
    if (this.config.isTest) {
      this.logger.log('scheduler disabled in test environment');
      return;
    }
    for (const job of this.jobs) {
      // Stagger the first tick so jobs do not all fire on the same second.
      const firstDelay = Math.floor(Math.random() * 5000) + 5000;
      const timer = setInterval(() => void this.runJob(job), job.intervalMs);
      timer.unref(); // never keep the process alive just for a background job
      this.timers.push(timer);
      setTimeout(() => void this.runJob(job), firstDelay).unref();
      this.logger.log(`scheduled ${job.name} every ${Math.round(job.intervalMs / 1000)}s`);
    }
  }

  onModuleDestroy(): void {
    for (const timer of this.timers) clearInterval(timer);
    this.timers.length = 0;
  }

  private async runJob(job: Job): Promise<void> {
    const started = Date.now();
    try {
      const result = await job.run();
      const affected = typeof result === 'number' ? result : undefined;
      this.logger.debug(
        `${job.name} finished in ${Date.now() - started}ms${affected !== undefined ? ` (${affected} affected)` : ''}`,
      );
    } catch (err) {
      this.logger.error(`${job.name} failed: ${(err as Error).message}`);
    }
  }
}
