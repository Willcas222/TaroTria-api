import type { Wallet, WalletTransaction } from '@prisma/client';

export interface WalletSummary {
  balance: number;
}

export interface WalletTransactionSummary {
  id: string;
  type: WalletTransaction['type'];
  amount: number;
  balanceAfter: number;
  readingId: string | null;
  orderId: string | null;
  createdAt: Date;
}

export interface PaginatedWalletTransactions {
  items: WalletTransactionSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export function toWalletSummary(wallet: Wallet): WalletSummary {
  return { balance: wallet.balance };
}

export function toWalletTransactionSummary(
  transaction: WalletTransaction,
): WalletTransactionSummary {
  return {
    id: transaction.id,
    type: transaction.type,
    amount: transaction.amount,
    balanceAfter: transaction.balanceAfter,
    readingId: transaction.readingId,
    orderId: transaction.orderId,
    createdAt: transaction.createdAt,
  };
}

// Señal de control interna: alguien más ya reservó créditos para esta
// lectura (doble clic, reintento concurrente). Nunca se traduce
// directamente a una respuesta HTTP de error — quien la atrapa debe tratar
// el envío como ya realizado, no como un fallo.
export class ReadingAlreadySubmittedError extends Error {}
