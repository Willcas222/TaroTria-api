import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReadingAlreadySubmittedError } from './wallet.types';
import { WalletService } from './wallet.service';

function uniqueConstraintError() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

describe('WalletService', () => {
  let service: WalletService;
  let prisma: {
    wallet: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      updateMany: jest.Mock;
      update: jest.Mock;
    };
    walletTransaction: {
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    creditReservation: {
      create: jest.Mock;
      updateMany: jest.Mock;
      findUniqueOrThrow: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let configService: { get: jest.Mock };
  let auditService: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      wallet: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
      walletTransaction: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      creditReservation: {
        create: jest.fn(),
        updateMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      $transaction: jest.fn(async (fn) => fn(prisma)),
    };
    configService = {
      get: jest.fn().mockReturnValue(10),
    };
    auditService = {
      record: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        WalletService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: configService },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get(WalletService);
  });

  describe('createWalletWithBonus', () => {
    it('creates the wallet with the configured bonus and logs it in the ledger', async () => {
      prisma.wallet.create.mockResolvedValue({ id: 'wallet-1', balance: 10 });

      await service.createWalletWithBonus('user-1');

      expect(prisma.wallet.create).toHaveBeenCalledWith({
        data: { userId: 'user-1', balance: 10 },
      });
      expect(prisma.walletTransaction.create).toHaveBeenCalledWith({
        data: {
          walletId: 'wallet-1',
          type: 'BONUS',
          amount: 10,
          balanceAfter: 10,
          idempotencyKey: 'bonus:user-1',
        },
      });
    });

    it('does not log a ledger entry when the configured bonus is zero', async () => {
      configService.get.mockReturnValue(0);
      prisma.wallet.create.mockResolvedValue({ id: 'wallet-1', balance: 0 });

      await service.createWalletWithBonus('user-1');

      expect(prisma.walletTransaction.create).not.toHaveBeenCalled();
    });
  });

  describe('getWallet', () => {
    it('throws NotFoundException when the user has no wallet', async () => {
      prisma.wallet.findUnique.mockResolvedValue(null);

      await expect(service.getWallet('user-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns the current balance', async () => {
      prisma.wallet.findUnique.mockResolvedValue({ balance: 42 });

      await expect(service.getWallet('user-1')).resolves.toEqual({
        balance: 42,
      });
    });
  });

  describe('reserveCreditsForReading', () => {
    it('throws BadRequestException when the atomic debit affects zero rows (insufficient balance)', async () => {
      prisma.wallet.findUniqueOrThrow.mockResolvedValue({
        id: 'wallet-1',
        balance: 5,
      });
      prisma.wallet.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.reserveCreditsForReading(
          prisma as never,
          'user-1',
          'reading-1',
          10,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.creditReservation.create).not.toHaveBeenCalled();
    });

    it('debits the wallet atomically, creates the reservation, and logs a RESERVATION transaction', async () => {
      prisma.wallet.findUniqueOrThrow
        .mockResolvedValueOnce({ id: 'wallet-1', balance: 10 })
        .mockResolvedValueOnce({ id: 'wallet-1', balance: 0 });
      prisma.wallet.updateMany.mockResolvedValue({ count: 1 });

      await service.reserveCreditsForReading(
        prisma as never,
        'user-1',
        'reading-1',
        10,
      );

      expect(prisma.wallet.updateMany).toHaveBeenCalledWith({
        where: { id: 'wallet-1', balance: { gte: 10 } },
        data: { balance: { decrement: 10 } },
      });
      expect(prisma.creditReservation.create).toHaveBeenCalledWith({
        data: {
          walletId: 'wallet-1',
          readingId: 'reading-1',
          amount: 10,
          status: 'ACTIVE',
        },
      });
      expect(prisma.walletTransaction.create).toHaveBeenCalledWith({
        data: {
          walletId: 'wallet-1',
          type: 'RESERVATION',
          amount: -10,
          balanceAfter: 0,
          idempotencyKey: 'reservation:reading-1',
          readingId: 'reading-1',
        },
      });
    });

    it('throws ReadingAlreadySubmittedError when another request already reserved for this reading (race)', async () => {
      prisma.wallet.findUniqueOrThrow.mockResolvedValue({
        id: 'wallet-1',
        balance: 10,
      });
      prisma.wallet.updateMany.mockResolvedValue({ count: 1 });
      prisma.creditReservation.create.mockRejectedValue(
        uniqueConstraintError(),
      );

      await expect(
        service.reserveCreditsForReading(
          prisma as never,
          'user-1',
          'reading-1',
          10,
        ),
      ).rejects.toBeInstanceOf(ReadingAlreadySubmittedError);

      expect(prisma.walletTransaction.create).not.toHaveBeenCalled();
    });
  });

  describe('confirmConsumption', () => {
    it('is idempotent: does nothing when the reservation is no longer ACTIVE', async () => {
      prisma.creditReservation.updateMany.mockResolvedValue({ count: 0 });

      await service.confirmConsumption('reading-1');

      expect(prisma.walletTransaction.create).not.toHaveBeenCalled();
    });

    it('marks the reservation CONSUMED and logs a zero-amount CONSUMPTION entry', async () => {
      prisma.creditReservation.updateMany.mockResolvedValue({ count: 1 });
      prisma.creditReservation.findUniqueOrThrow.mockResolvedValue({
        walletId: 'wallet-1',
        amount: 10,
      });
      prisma.wallet.findUniqueOrThrow.mockResolvedValue({
        id: 'wallet-1',
        balance: 0,
      });

      await service.confirmConsumption('reading-1');

      expect(prisma.creditReservation.updateMany).toHaveBeenCalledWith({
        where: { readingId: 'reading-1', status: 'ACTIVE' },
        data: { status: 'CONSUMED' },
      });
      expect(prisma.walletTransaction.create).toHaveBeenCalledWith({
        data: {
          walletId: 'wallet-1',
          type: 'CONSUMPTION',
          amount: 0,
          balanceAfter: 0,
          idempotencyKey: 'consumption:reading-1',
          readingId: 'reading-1',
        },
      });
    });
  });

  describe('releaseReservation', () => {
    it('is idempotent: does nothing when the reservation is no longer ACTIVE', async () => {
      prisma.creditReservation.updateMany.mockResolvedValue({ count: 0 });

      await service.releaseReservation('reading-1');

      expect(prisma.wallet.update).not.toHaveBeenCalled();
      expect(prisma.walletTransaction.create).not.toHaveBeenCalled();
    });

    it('marks the reservation RELEASED, credits the wallet back, and logs a RELEASE transaction', async () => {
      prisma.creditReservation.updateMany.mockResolvedValue({ count: 1 });
      prisma.creditReservation.findUniqueOrThrow.mockResolvedValue({
        walletId: 'wallet-1',
        amount: 10,
      });
      prisma.wallet.update.mockResolvedValue({ id: 'wallet-1', balance: 10 });

      await service.releaseReservation('reading-1');

      expect(prisma.wallet.update).toHaveBeenCalledWith({
        where: { id: 'wallet-1' },
        data: { balance: { increment: 10 } },
      });
      expect(prisma.walletTransaction.create).toHaveBeenCalledWith({
        data: {
          walletId: 'wallet-1',
          type: 'RELEASE',
          amount: 10,
          balanceAfter: 10,
          idempotencyKey: 'release:reading-1',
          readingId: 'reading-1',
        },
      });
    });
  });

  describe('creditPurchase', () => {
    it('increments the wallet balance and logs a PURCHASE transaction tied to the order', async () => {
      prisma.wallet.findUniqueOrThrow.mockResolvedValue({
        id: 'wallet-1',
        balance: 0,
      });
      prisma.wallet.update.mockResolvedValue({ id: 'wallet-1', balance: 50 });

      await service.creditPurchase(prisma as never, 'user-1', 'order-1', 50);

      expect(prisma.wallet.update).toHaveBeenCalledWith({
        where: { id: 'wallet-1' },
        data: { balance: { increment: 50 } },
      });
      expect(prisma.walletTransaction.create).toHaveBeenCalledWith({
        data: {
          walletId: 'wallet-1',
          type: 'PURCHASE',
          amount: 50,
          balanceAfter: 50,
          idempotencyKey: 'purchase:order-1',
          orderId: 'order-1',
        },
      });
    });
  });

  describe('adjustBalance', () => {
    it('throws BadRequestException when amount is zero', async () => {
      await expect(
        service.adjustBalance('user-1', 0, 'motivo', 'admin-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.wallet.findUnique).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the user has no wallet', async () => {
      prisma.wallet.findUnique.mockResolvedValue(null);

      await expect(
        service.adjustBalance('user-1', 10, 'motivo', 'admin-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('increments the balance, logs an ADJUSTMENT transaction, and records the audit entry atomically', async () => {
      prisma.wallet.findUnique.mockResolvedValue({
        id: 'wallet-1',
        balance: 10,
      });
      prisma.wallet.update.mockResolvedValue({ id: 'wallet-1', balance: 25 });

      const result = await service.adjustBalance(
        'user-1',
        15,
        'compensación por error de soporte',
        'admin-1',
      );

      expect(result).toEqual({ balance: 25 });
      expect(prisma.wallet.update).toHaveBeenCalledWith({
        where: { id: 'wallet-1' },
        data: { balance: { increment: 15 } },
      });
      expect(prisma.walletTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          walletId: 'wallet-1',
          type: 'ADJUSTMENT',
          amount: 15,
          balanceAfter: 25,
        }),
      });
      expect(auditService.record).toHaveBeenCalledWith(
        {
          actorUserId: 'admin-1',
          action: 'wallet.adjustment',
          targetType: 'User',
          targetId: 'user-1',
          reason: 'compensación por error de soporte',
          metadata: { amount: 15, balanceAfter: 25 },
        },
        prisma,
      );
    });

    it('debits the balance atomically for a negative adjustment', async () => {
      prisma.wallet.findUnique.mockResolvedValue({
        id: 'wallet-1',
        balance: 10,
      });
      prisma.wallet.updateMany.mockResolvedValue({ count: 1 });
      prisma.wallet.findUniqueOrThrow.mockResolvedValue({
        id: 'wallet-1',
        balance: 5,
      });

      const result = await service.adjustBalance(
        'user-1',
        -5,
        'corrección de saldo duplicado',
        'admin-1',
      );

      expect(result).toEqual({ balance: 5 });
      expect(prisma.wallet.updateMany).toHaveBeenCalledWith({
        where: { id: 'wallet-1', balance: { gte: 5 } },
        data: { balance: { decrement: 5 } },
      });
    });

    it('throws BadRequestException when a negative adjustment would leave the balance below zero', async () => {
      prisma.wallet.findUnique.mockResolvedValue({
        id: 'wallet-1',
        balance: 3,
      });
      prisma.wallet.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.adjustBalance('user-1', -5, 'motivo', 'admin-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.walletTransaction.create).not.toHaveBeenCalled();
      expect(auditService.record).not.toHaveBeenCalled();
    });
  });
});
