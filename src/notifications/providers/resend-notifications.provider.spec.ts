const sendMock = jest.fn();

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: sendMock },
  })),
}));

import { ResendNotificationsProvider } from './resend-notifications.provider';

describe('ResendNotificationsProvider', () => {
  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'RESEND_API_KEY') return 're_test_key';
      if (key === 'EMAIL_FROM') return 'TAROTRIA <onboarding@resend.dev>';
      return undefined;
    }),
  };

  beforeEach(() => {
    sendMock.mockReset();
  });

  it('sends the email-verification template with the verification link', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null });
    const provider = new ResendNotificationsProvider(configService as never);

    await provider.sendEmail({
      to: 'ana@example.com',
      subject: 'Verifica tu correo',
      templateId: 'email-verification',
      context: {
        name: 'Ana',
        verificationUrl: 'https://app.test/verify?token=abc',
      },
    });

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'TAROTRIA <onboarding@resend.dev>',
        to: 'ana@example.com',
        subject: 'Verifica tu correo',
        html: expect.stringContaining('https://app.test/verify?token=abc'),
      }),
    );
  });

  it('sends the password-reset template with the reset link', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-2' }, error: null });
    const provider = new ResendNotificationsProvider(configService as never);

    await provider.sendEmail({
      to: 'ana@example.com',
      subject: 'Recupera tu contraseña',
      templateId: 'password-reset',
      context: { name: 'Ana', resetUrl: 'https://app.test/reset?token=xyz' },
    });

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining('https://app.test/reset?token=xyz'),
      }),
    );
  });

  it('escapes the user-controlled name to avoid HTML injection', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-3' }, error: null });
    const provider = new ResendNotificationsProvider(configService as never);

    await provider.sendEmail({
      to: 'ana@example.com',
      subject: 'Verifica tu correo',
      templateId: 'email-verification',
      context: {
        name: '<script>alert(1)</script>',
        verificationUrl: 'https://app.test/verify?token=abc',
      },
    });

    const html = sendMock.mock.calls[0][0].html as string;
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('throws when Resend rejects the send', async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: { message: 'Domain not verified' },
    });
    const provider = new ResendNotificationsProvider(configService as never);

    await expect(
      provider.sendEmail({
        to: 'ana@example.com',
        subject: 'Verifica tu correo',
        templateId: 'email-verification',
        context: { name: 'Ana', verificationUrl: 'https://app.test/verify' },
      }),
    ).rejects.toThrow('Domain not verified');
  });
});
