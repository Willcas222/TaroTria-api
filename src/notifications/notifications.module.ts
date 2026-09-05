import { Module } from '@nestjs/common';
import { NOTIFICATIONS_PROVIDER } from './notifications-provider.interface';
import { ConsoleNotificationsProvider } from './providers/console-notifications.provider';

@Module({
  providers: [
    ConsoleNotificationsProvider,
    { provide: NOTIFICATIONS_PROVIDER, useClass: ConsoleNotificationsProvider },
  ],
  exports: [NOTIFICATIONS_PROVIDER],
})
export class NotificationsModule {}
