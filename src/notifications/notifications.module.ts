import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NOTIFICATIONS_PROVIDER } from './notifications-provider.interface';
import { ConsoleNotificationsProvider } from './providers/console-notifications.provider';
import { ResendNotificationsProvider } from './providers/resend-notifications.provider';

@Module({
  providers: [
    ConsoleNotificationsProvider,
    ResendNotificationsProvider,
    {
      provide: NOTIFICATIONS_PROVIDER,
      // Sin RESEND_API_KEY (dev/test/CI) usa el stub de consola. Con ella
      // (staging/producción, o cualquiera que quiera probarlo local) usa
      // Resend de verdad -- ver env.validation.ts.
      useFactory: (
        configService: ConfigService,
        consoleProvider: ConsoleNotificationsProvider,
        resendProvider: ResendNotificationsProvider,
      ) =>
        configService.get<string>('RESEND_API_KEY')
          ? resendProvider
          : consoleProvider,
      inject: [ConfigService, ConsoleNotificationsProvider, ResendNotificationsProvider],
    },
  ],
  exports: [NOTIFICATIONS_PROVIDER],
})
export class NotificationsModule {}
