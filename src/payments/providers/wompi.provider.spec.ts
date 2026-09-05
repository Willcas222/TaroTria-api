import { createHash } from 'crypto';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WompiProvider } from './wompi.provider';

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

describe('WompiProvider', () => {
  let provider: WompiProvider;
  let configService: { get: jest.Mock };
  const config: Record<string, string> = {
    WOMPI_PUBLIC_KEY: 'pub_test_key',
    WOMPI_PRIVATE_KEY: 'prv_test_key',
    WOMPI_EVENTS_SECRET: 'events-secret',
    WOMPI_INTEGRITY_SECRET: 'integrity-secret',
    WOMPI_API_URL: 'https://sandbox.wompi.co/v1',
  };

  beforeEach(async () => {
    configService = { get: jest.fn((key: string) => config[key]) };

    const module = await Test.createTestingModule({
      providers: [
        WompiProvider,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    provider = module.get(WompiProvider);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('buildCheckoutIntent', () => {
    it('computes the integrity signature per the documented Wompi algorithm', () => {
      const intent = provider.buildCheckoutIntent({
        reference: 'order-1-abc',
        amountInCents: 50000,
        currency: 'COP',
        redirectUrl: 'https://app.example.com/wallet/checkout/order-1',
      });

      const expectedSignature = sha256Hex(
        'order-1-abc50000COPintegrity-secret',
      );

      expect(intent).toEqual({
        reference: 'order-1-abc',
        publicKey: 'pub_test_key',
        amountInCents: 50000,
        currency: 'COP',
        integritySignature: expectedSignature,
        redirectUrl: 'https://app.example.com/wallet/checkout/order-1',
      });
    });
  });

  describe('verifyAndParseWebhook', () => {
    function buildPayload(overrides?: { checksum?: string; status?: string }) {
      const transaction = {
        id: 'tx-1',
        status: overrides?.status ?? 'APPROVED',
        amount_in_cents: 50000,
        reference: 'order-1-abc',
        currency: 'COP',
      };
      const timestamp = 1_700_000_000;
      const properties = [
        'transaction.id',
        'transaction.status',
        'transaction.amount_in_cents',
      ];
      const concatenated = `${transaction.id}${transaction.status}${transaction.amount_in_cents}`;
      const checksum =
        overrides?.checksum ??
        sha256Hex(`${concatenated}${timestamp}events-secret`);

      return {
        event: 'transaction.updated',
        data: { transaction },
        timestamp,
        signature: { properties, checksum },
      };
    }

    it('returns null when the payload does not match the expected shape', () => {
      expect(provider.verifyAndParseWebhook({ nonsense: true })).toBeNull();
    });

    it('returns null when the checksum does not match', () => {
      const payload = buildPayload({ checksum: 'deadbeef'.repeat(8) });

      expect(provider.verifyAndParseWebhook(payload)).toBeNull();
    });

    it('accepts a checksum that differs only in case', () => {
      const payload = buildPayload();
      payload.signature.checksum = payload.signature.checksum.toUpperCase();

      expect(provider.verifyAndParseWebhook(payload)).not.toBeNull();
    });

    it('returns the parsed transaction and a deterministic eventId on a valid signature', () => {
      const payload = buildPayload();

      const result = provider.verifyAndParseWebhook(payload);

      expect(result).toEqual({
        eventId: 'tx-1-APPROVED-1700000000',
        transaction: {
          reference: 'order-1-abc',
          providerTransactionId: 'tx-1',
          status: 'APPROVED',
          amountInCents: 50000,
          currency: 'COP',
        },
      });
    });

    it('produces different eventIds for different statuses of the same transaction (retries vs. real transitions)', () => {
      const pending = buildPayload({ status: 'PENDING' });
      const approved = buildPayload({ status: 'APPROVED' });

      const pendingResult = provider.verifyAndParseWebhook(pending);
      const approvedResult = provider.verifyAndParseWebhook(approved);

      expect(pendingResult?.eventId).not.toEqual(approvedResult?.eventId);
    });
  });

  describe('fetchTransaction', () => {
    it('returns the parsed transaction on a successful response', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            id: 'tx-1',
            status: 'APPROVED',
            amount_in_cents: 50000,
            reference: 'order-1-abc',
            currency: 'COP',
          },
        }),
      }) as never;

      const result = await provider.fetchTransaction('tx-1');

      expect(result).toEqual({
        reference: 'order-1-abc',
        providerTransactionId: 'tx-1',
        status: 'APPROVED',
        amountInCents: 50000,
        currency: 'COP',
      });
      expect(global.fetch).toHaveBeenCalledWith(
        'https://sandbox.wompi.co/v1/transactions/tx-1',
        { headers: { Authorization: 'Bearer prv_test_key' } },
      );
    });

    it('returns null when the response is not ok', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false }) as never;

      await expect(provider.fetchTransaction('tx-1')).resolves.toBeNull();
    });

    it('returns null when the response body does not match the expected shape', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ unexpected: true }),
      }) as never;

      await expect(provider.fetchTransaction('tx-1')).resolves.toBeNull();
    });

    it('returns null when the request itself fails', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('network down'));

      await expect(provider.fetchTransaction('tx-1')).resolves.toBeNull();
    });
  });
});
