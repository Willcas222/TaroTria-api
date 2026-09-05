export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export interface CheckoutIntent {
  reference: string;
  publicKey: string;
  amountInCents: number;
  currency: string;
  integritySignature: string;
  redirectUrl: string;
}

export type TransactionStatus =
  'PENDING' | 'APPROVED' | 'DECLINED' | 'ERROR' | 'VOIDED';

export interface TransactionResult {
  reference: string;
  providerTransactionId: string;
  status: TransactionStatus;
  amountInCents: number;
  currency: string;
}

// Agnóstico de proveedor (mismo patrón que AIProvider en src/ai/): el SDK o
// la forma concreta del payload de Wompi solo puede aparecer dentro de
// payments/providers/, nunca fuera.
export interface PaymentProvider {
  readonly name: string;

  buildCheckoutIntent(params: {
    reference: string;
    amountInCents: number;
    currency: string;
    redirectUrl: string;
  }): CheckoutIntent;

  // Retorna null si la firma es inválida o el payload no tiene la forma
  // esperada — nunca lanza, para que el controlador de webhook siempre
  // pueda responder de forma predecible.
  verifyAndParseWebhook(rawBody: unknown): {
    eventId: string;
    transaction: TransactionResult;
  } | null;

  // Conciliación activa (sección "Estados de checkout y conciliación
  // básica" del checklist): consulta directamente a Wompi el estado real de
  // una transacción, para no depender únicamente de que el webhook llegue.
  fetchTransaction(
    providerTransactionId: string,
  ): Promise<TransactionResult | null>;
}
