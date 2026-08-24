import { Global, Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationDispatcher } from './dispatcher.service';

/**
 * Core notification capability (create + dispatch).
 *
 * Global because orders, payments, returns and reviews all notify. Kept
 * separate from `NotificationsModule`, which only owns the customer-facing
 * inbox HTTP endpoints — splitting them stops the controllers from being
 * registered twice.
 */
@Global()
@Module({
  providers: [NotificationService, NotificationDispatcher],
  exports: [NotificationService, NotificationDispatcher],
})
export class NotificationsCoreModule {}
