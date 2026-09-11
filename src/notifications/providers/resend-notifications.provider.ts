import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import type {
  NotificationsProvider,
  SendEmailInput,
} from '../notifications-provider.interface';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Los únicos dos correos transaccionales que existen hoy en el producto
// (verificación de cuenta y recuperación de contraseña) -- ver AuthService.
// Si se agrega un tercer templateId sin registrarlo aquí, el correo igual
// sale, pero con un cuerpo genérico (ver el fallback en sendEmail).
const EMAIL_BODIES: Record<
  string,
  (context: Record<string, unknown>) => string
> = {
  'email-verification': (context) => `
    <p>Hola ${escapeHtml(String(context.name ?? ''))},</p>
    <p>Confirma tu correo para activar tu cuenta en TAROTRIA:</p>
    <p><a href="${String(context.verificationUrl)}">Verificar mi correo</a></p>
    <p>Si no creaste esta cuenta, ignora este mensaje.</p>
  `,
  'password-reset': (context) => `
    <p>Hola ${escapeHtml(String(context.name ?? ''))},</p>
    <p>Solicitaste restablecer tu contraseña en TAROTRIA:</p>
    <p><a href="${String(context.resetUrl)}">Restablecer mi contraseña</a></p>
    <p>Si no fuiste tú, ignora este mensaje: tu contraseña actual sigue siendo válida.</p>
  `,
};

@Injectable()
export class ResendNotificationsProvider implements NotificationsProvider {
  private readonly logger = new Logger(ResendNotificationsProvider.name);
  private readonly client: Resend;
  private readonly from: string;

  constructor(private readonly configService: ConfigService) {
    this.client = new Resend(
      this.configService.get<string>('RESEND_API_KEY'),
    );
    this.from = this.configService.get<string>('EMAIL_FROM')!;
  }

  async sendEmail(input: SendEmailInput): Promise<void> {
    const renderBody = EMAIL_BODIES[input.templateId];
    const html = renderBody
      ? renderBody(input.context)
      : `<p>${escapeHtml(input.subject)}</p>`;

    const { error } = await this.client.emails.send({
      from: this.from,
      to: input.to,
      subject: input.subject,
      html,
    });

    if (error) {
      this.logger.error(
        `Resend rechazó el correo a ${input.to} (template=${input.templateId}): ${error.message}`,
      );
      throw new Error(`No fue posible enviar el correo: ${error.message}`);
    }
  }
}
