import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ReadingAlreadySubmittedError,
  toWalletSummary,
  toWalletTransactionSummary,
  type PaginatedWalletTransactions,
  type WalletSummary,
} from './wallet.types';

type Tx = Prisma.TransactionClient;

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {}

  // Se llama una sola vez, al registrarse (sección 21: "registro → créditos
  // bonus"). `Wallet.userId` único + `WalletTransaction.idempotencyKey`
  // único hacen que una segunda invocación accidental falle en vez de
  // duplicar el bono.
  async createWalletWithBonus(userId: string): Promise<void> {
    const bonusAmount = this.configService.get<number>(
      'WALLET_INITIAL_BONUS_CREDITS',
    ) as number;

    await this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.create({
        data: { userId, balance: bonusAmount },
      });

      if (bonusAmount > 0) {
        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type: 'BONUS',
            amount: bonusAmount,
            balanceAfter: bonusAmount,
            idempotencyKey: `bonus:${userId}`,
          },
        });
      }
    });
  }

  async getWallet(userId: string): Promise<WalletSummary> {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      throw new NotFoundException('No se encontró tu wallet.');
    }
    return toWalletSummary(wallet);
  }

  async listTransactions(
    userId: string,
    page: number,
    pageSize: number,
  ): Promise<PaginatedWalletTransactions> {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      throw new NotFoundException('No se encontró tu wallet.');
    }

    const [items, total] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where: { walletId: wallet.id },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.walletTransaction.count({ where: { walletId: wallet.id } }),
    ]);

    return {
      items: items.map(toWalletTransactionSummary),
      total,
      page,
      pageSize,
    };
  }

  // Reserva créditos para una lectura, compuesta dentro de la misma
  // transacción que crea sus tiradas/registra sus imágenes (el llamador
  // pasa su propio `tx`) para que un fallo posterior revierta también la
  // reserva — nunca queda una lectura con créditos debitados pero sin
  // enviar. El descuento usa una actualización atómica condicionada
  // (`balance >= amount`) en vez de un SELECT + UPDATE separados, que es lo
  // que realmente evita saldo negativo bajo concurrencia real (sección 8
  // del plan: "usar actualización atómica con control de concurrencia").
  async reserveCreditsForReading(
    tx: Tx,
    userId: string,
    readingId: string,
    amount: number,
  ): Promise<void> {
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });

    const debited = await tx.wallet.updateMany({
      where: { id: wallet.id, balance: { gte: amount } },
      data: { balance: { decrement: amount } },
    });
    if (debited.count === 0) {
      throw new BadRequestException(
        'Saldo insuficiente para enviar esta lectura.',
      );
    }

    const updatedWallet = await tx.wallet.findUniqueOrThrow({
      where: { id: wallet.id },
    });

    try {
      await tx.creditReservation.create({
        data: { walletId: wallet.id, readingId, amount, status: 'ACTIVE' },
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        // Otra solicitud (doble clic, reintento concurrente) ya reservó
        // créditos para esta misma lectura primero.
        throw new ReadingAlreadySubmittedError();
      }
      throw error;
    }

    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: 'RESERVATION',
        amount: -amount,
        balanceAfter: updatedWallet.balance,
        idempotencyKey: `reservation:${readingId}`,
        readingId,
      },
    });
  }

  // Confirma el consumo cuando la lectura termina COMPLETED. No mueve saldo
  // (ya se debitó al reservar) — solo cierra la reserva y deja la
  // transición registrada en el ledger para que quede auditable cuándo se
  // consolidó. Idempotente: si la reserva ya no está ACTIVE (doble llamada,
  // reintento), no hace nada.
  async confirmConsumption(readingId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.creditReservation.updateMany({
        where: { readingId, status: 'ACTIVE' },
        data: { status: 'CONSUMED' },
      });
      if (updated.count === 0) {
        return;
      }

      const reservation = await tx.creditReservation.findUniqueOrThrow({
        where: { readingId },
      });
      const wallet = await tx.wallet.findUniqueOrThrow({
        where: { id: reservation.walletId },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: reservation.walletId,
          type: 'CONSUMPTION',
          amount: 0,
          balanceAfter: wallet.balance,
          idempotencyKey: `consumption:${readingId}`,
          readingId,
        },
      });
    });
  }

  // Libera la reserva y devuelve los créditos cuando la lectura falla
  // definitivamente (agotados los reintentos, de IA o de infraestructura).
  // Idempotente por la misma razón que confirmConsumption.
  async releaseReservation(readingId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.creditReservation.updateMany({
        where: { readingId, status: 'ACTIVE' },
        data: { status: 'RELEASED' },
      });
      if (updated.count === 0) {
        return;
      }

      const reservation = await tx.creditReservation.findUniqueOrThrow({
        where: { readingId },
      });
      const updatedWallet = await tx.wallet.update({
        where: { id: reservation.walletId },
        data: { balance: { increment: reservation.amount } },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: reservation.walletId,
          type: 'RELEASE',
          amount: reservation.amount,
          balanceAfter: updatedWallet.balance,
          idempotencyKey: `release:${readingId}`,
          readingId,
        },
      });
    });
  }

  // Acredita los créditos de una orden pagada. Se compone dentro de la
  // transacción del llamador (igual que reserveCreditsForReading) porque
  // quien invoca esto (PaymentsService, al procesar un webhook aprobado) ya
  // garantiza con su propio guard atómico sobre `Payment.status` que esto
  // se ejecuta como máximo una vez por orden — `idempotencyKey` sigue
  // siendo la última red de seguridad si esa garantía fallara.
  async creditPurchase(
    tx: Tx,
    userId: string,
    orderId: string,
    credits: number,
  ): Promise<void> {
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });

    const updatedWallet = await tx.wallet.update({
      where: { id: wallet.id },
      data: { balance: { increment: credits } },
    });

    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: 'PURCHASE',
        amount: credits,
        balanceAfter: updatedWallet.balance,
        idempotencyKey: `purchase:${orderId}`,
        orderId,
      },
    });
  }

  // Ajuste manual de un administrador (sección 17 del plan: "auditoría de
  // accesos administrativos y ajustes de saldo"). El registro de auditoría
  // se crea dentro de la misma transacción que el movimiento de saldo para
  // que nunca pueda existir el uno sin el otro. Un ajuste negativo usa la
  // misma actualización atómica condicionada que reserveCreditsForReading
  // para no dejar el saldo en negativo bajo concurrencia real.
  async adjustBalance(
    userId: string,
    amount: number,
    reason: string,
    actorUserId: string,
  ): Promise<WalletSummary> {
    if (amount === 0) {
      throw new BadRequestException('El ajuste no puede ser cero.');
    }

    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet) {
        throw new NotFoundException('No se encontró el wallet del usuario.');
      }

      let updatedWallet;
      if (amount < 0) {
        const result = await tx.wallet.updateMany({
          where: { id: wallet.id, balance: { gte: -amount } },
          data: { balance: { decrement: -amount } },
        });
        if (result.count === 0) {
          throw new BadRequestException(
            'El ajuste dejaría el saldo en negativo.',
          );
        }
        updatedWallet = await tx.wallet.findUniqueOrThrow({
          where: { id: wallet.id },
        });
      } else {
        updatedWallet = await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: { increment: amount } },
        });
      }

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'ADJUSTMENT',
          amount,
          balanceAfter: updatedWallet.balance,
          idempotencyKey: `adjustment:${randomUUID()}`,
        },
      });

      await this.auditService.record(
        {
          actorUserId,
          action: 'wallet.adjustment',
          targetType: 'User',
          targetId: userId,
          reason,
          metadata: { amount, balanceAfter: updatedWallet.balance },
        },
        tx,
      );

      return toWalletSummary(updatedWallet);
    });
  }
}
