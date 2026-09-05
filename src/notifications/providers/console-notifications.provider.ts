import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  NotificationsProvider,
  SendEmailInput,
} from '../notifications-provider.interface';

@Injectable()
export class ConsoleNotificationsProvider implements NotificationsProvider {
  private readonly logger = new Logger(ConsoleNotificationsProvider.name);

  constructor(private readonly configService: ConfigService) {}

  async sendEmail(input: SendEmailInput): Promise<void> {
    const environment = this.configService.get<string>('app.environment');
    const message = `[email stub] to=${input.to} subject="${input.subject}" template=${input.templateId} context=${JSON.stringify(input.context)}`;

    if (environment === 'production' || environment === 'staging') {
      this.logger.warn(
        `${message} — no hay un proveedor de correo real configurado todavía.`,
      );
    } else {
      this.logger.log(message);
    }
  }
}
