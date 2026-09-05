import type { Payment } from '@prisma/client';

export interface AdminPaymentSummary {
  id: string;
  orderId: string;
  provider: string;
  providerReference: string;
  providerTransactionId: string | null;
  status: Payment['status'];
  amountCents: number;
  currency: string;
  createdAt: Date;
}

export function toAdminPaymentSummary(payment: Payment): AdminPaymentSummary {
  return {
    id: payment.id,
    orderId: payment.orderId,
    provider: payment.provider,
    providerReference: payment.providerReference,
    providerTransactionId: payment.providerTransactionId,
    status: payment.status,
    amountCents: payment.amountCents,
    currency: payment.currency,
    createdAt: payment.createdAt,
  };
}

export interface PaginatedPayments {
  items: AdminPaymentSummary[];
  total: number;
  page: number;
  pageSize: number;
}
