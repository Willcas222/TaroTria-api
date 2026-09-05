import { createHash } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import type {
  CheckoutIntent,
  PaymentProvider,
  TransactionResult,
  TransactionStatus,
} from '../payment-provider.interface';

const TRANSACTION_STATUSES = [
  'PENDING',
  'APPROVED',
  'DECLINED',
  'ERROR',
  'VOIDED',
] as const;

const wompiWebhookSchema = z.object({
  event: z.string(),
  data: z.object({
    transaction: z.object({
      id: z.string().min(1),
      status: z.enum(TRANSACTION_STATUSES),
      amount_in_cents: z.number().int(),
      reference: z.string().min(1),
      currency: z.string().min(1),
    }),
  }),
  timestamp: z.number(),
  signature: z.object({
    properties: z.array(z.string().min(1)).min(1),
    checksum: z.string().min(1),
  }),
});

const wompiTransactionResponseSchema = z.object({
  data: z.object({
    id: z.string().min(1),
    status: z.enum(TRANSACTION_STATUSES),
    amount_in_cents: z.number().int(),
    reference: z.string().min(1),
    currency: z.string().min(1),
  }),
});

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

// Navega un objeto por un dot-path ("transaction.id" -> data.transaction.id)
// tal como Wompi describe las propiedades a firmar en signature.properties.
function readByPath(source: unknown, path: string): string {
  const value = path
    .split('.')
    .reduce<unknown>(
      (acc, key) =>
        acc && typeof acc === 'object'
          ? (acc as Record<string, unknown>)[key]
          : undefined,
      source,
    );
  return value === undefined || value === null ? '' : String(value);
}

@Injectable()
export class WompiProvider implements PaymentProvider {
  readonly name = 'wompi';
  private readonly logger = new Logger(WompiProvider.name);

  constructor(private readonly configService: ConfigService) {}

  buildCheckoutIntent(params: {
    reference: string;
    amountInCents: number;
    currency: string;
    redirectUrl: string;
  }): CheckoutIntent {
    const integritySecret = this.configService.get<string>(
      'WOMPI_INTEGRITY_SECRET',
    ) as string;

    // Algoritmo documentado por Wompi para el Web Checkout: SHA-256 de la
    // concatenación exacta referencia+monto+moneda+secreto (sin separadores).
    const integritySignature = sha256Hex(
      `${params.reference}${params.amountInCents}${params.currency}${integritySecret}`,
    );

    return {
      reference: params.reference,
      publicKey: this.configService.get<string>('WOMPI_PUBLIC_KEY') as string,
      amountInCents: params.amountInCents,
      currency: params.currency,
      integritySignature,
      redirectUrl: params.redirectUrl,
    };
  }

  verifyAndParseWebhook(
    rawBody: unknown,
  ): { eventId: string; transaction: TransactionResult } | null {
    const parsed = wompiWebhookSchema.safeParse(rawBody);
    if (!parsed.success) {
      this.logger.warn(
        `Rejected malformed Wompi webhook payload: ${parsed.error.message}`,
      );
      return null;
    }

    const { data, timestamp, signature } = parsed.data;
    const eventsSecret = this.configService.get<string>(
      'WOMPI_EVENTS_SECRET',
    ) as string;

    const concatenatedProperties = signature.properties
      .map((path) => readByPath(data, path))
      .join('');
    const expectedChecksum = sha256Hex(
      `${concatenatedProperties}${timestamp}${eventsSecret}`,
    );

    if (expectedChecksum.toLowerCase() !== signature.checksum.toLowerCase()) {
      this.logger.warn('Rejected Wompi webhook with an invalid signature.');
      return null;
    }

    const transaction = data.transaction;
    return {
      // Una transición de estado real (nueva firma, nuevo timestamp) es un
      // evento nuevo y legítimo; una redelivery exacta del mismo evento
      // produce el mismo eventId y queda deduplicada por
      // webhook_events(provider, eventId).
      eventId: `${transaction.id}-${transaction.status}-${timestamp}`,
      transaction: {
        reference: transaction.reference,
        providerTransactionId: transaction.id,
        status: transaction.status as TransactionStatus,
        amountInCents: transaction.amount_in_cents,
        currency: transaction.currency,
      },
    };
  }

  async fetchTransaction(
    providerTransactionId: string,
  ): Promise<TransactionResult | null> {
    const apiUrl = this.configService.get<string>('WOMPI_API_URL');
    const privateKey = this.configService.get<string>('WOMPI_PRIVATE_KEY');

    try {
      const response = await fetch(
        `${apiUrl}/transactions/${providerTransactionId}`,
        { headers: { Authorization: `Bearer ${privateKey}` } },
      );
      if (!response.ok) {
        return null;
      }

      const body: unknown = await response.json();
      const parsed = wompiTransactionResponseSchema.safeParse(body);
      if (!parsed.success) {
        return null;
      }

      const tx = parsed.data.data;
      return {
        reference: tx.reference,
        providerTransactionId: tx.id,
        status: tx.status as TransactionStatus,
        amountInCents: tx.amount_in_cents,
        currency: tx.currency,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to fetch transaction ${providerTransactionId} from Wompi: ${(error as Error).message}`,
      );
      return null;
    }
  }
}
