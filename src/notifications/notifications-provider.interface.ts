export interface SendEmailInput {
  to: string;
  subject: string;
  templateId: string;
  context: Record<string, unknown>;
}

export interface NotificationsProvider {
  sendEmail(input: SendEmailInput): Promise<void>;
}

export const NOTIFICATIONS_PROVIDER = Symbol('NOTIFICATIONS_PROVIDER');
