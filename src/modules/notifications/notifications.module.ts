import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationDispatcher } from './dispatcher.service';

@Module({
  providers: [NotificationDispatcher],
  controllers: [NotificationsController],
  exports: [NotificationDispatcher],
})
export class NotificationsModule {}
