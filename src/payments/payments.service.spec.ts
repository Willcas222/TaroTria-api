import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { PAYMENT_PROVIDER } from './payment-provider.interface';
import { PaymentsService } from './payments.service';

function uniqueConstraintError() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prisma: {
    order: {
      findFirst: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    payment: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      updateMany: jest.Mock;
    };
    webhookEvent: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let walletService: { creditPurchase: jest.Mock };
  let configService: { get: jest.Mock };
  let provider: {
    name: string;
    buildCheckoutIntent: jest.Mock;
    verifyAndParseWebhook: jest.Mock;
    fetchTransaction: jest.Mock;
  };

  const baseOrder = {
    id: 'order-1',
    userId: 'user-1',
    credits: 50,
    priceCents: 990000,
    currency: 'COP',
    status: 'PENDING',
  };

  const basePayment = {
    id: 'payment-1',
    orderId: 'order-1',
    provider: 'wompi',
    providerReference: 'order-order-1-uuid',
    providerTransactionId: null,
    status: 'PENDING',
    amountCents: 990000,
    currency: 'COP',
  };

  const baseTransaction = {
    reference: 'order-order-1-uuid',
    providerTransactionId: 'tx-1',
    status: 'APPROVED' as const,
    amountInCents: 990000,
    currency: 'COP',
  };

  beforeEach(async () => {
    prisma = {
      order: {
        findFirst: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      payment: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        updateMany: jest.fn(),
      },
      webhookEvent: { create: jest.fn() },
      $transaction: jest.fn(async (fn) => fn(prisma)),
    };
    walletService = { creditPurchase: jest.fn() };
    configService = {
      get: jest.fn().mockReturnValue('https://app.example.com'),
    };
    provider = {
      name: 'wompi',
      buildCheckoutIntent: jest.fn(),
      verifyAndParseWebhook: jest.fn(),
      fetchTransaction: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: WalletService, useValue: walletService },
        { provide: ConfigService, useValue: configService },
        { provide: PAYMENT_PROVIDER, useValue: provider },
      ],
    }).compile();

    service = module.get(PaymentsService);
  });

  describe('createCheckoutIntent', () => {
    it('throws NotFoundException when the order does not belong to the user', async () => {
      prisma.order.findFirst.mockResolvedValue(null);

      await expect(
        service.createCheckoutIntent('user-1', 'order-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequestException when the order is no longer PENDING', async () => {
      prisma.order.findFirst.mockResolvedValue({
        ...baseOrder,
        status: 'PAID',
      });

      await expect(
        service.createCheckoutIntent('user-1', 'order-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('builds the checkout intent and persists a PENDING payment', async () => {
      prisma.order.findFirst.mockResolvedValue(baseOrder);
      provider.buildCheckoutIntent.mockReturnValue({
        reference: 'order-order-1-uuid',
        publicKey: 'pub_test',
        amountInCents: 990000,
        currency: 'COP',
        integritySignature: 'sig',
        redirectUrl: 'https://app.example.com/wallet/checkout/order-1',
      });

      const result = await service.createCheckoutIntent('user-1', 'order-1');

      expect(provider.buildCheckoutIntent).toHaveBeenCalledWith(
        expect.objectContaining({
          amountInCents: 990000,
          currency: 'COP',
          redirectUrl: 'https://app.example.com/wallet/checkout/order-1',
        }),
      );
      expect(prisma.payment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orderId: 'order-1',
          provider: 'wompi',
          status: 'PENDING',
          amountCents: 990000,
          currency: 'COP',
        }),
      });
      expect(result.integritySignature).toBe('sig');
    });
  });

  describe('handleWebhook', () => {
    it('throws UnauthorizedException when the signature is invalid', async () => {
      provider.verifyAndParseWebhook.mockReturnValue(null);

      await expect(service.handleWebhook({})).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.webhookEvent.create).not.toHaveBeenCalled();
    });

    it('is idempotent: a duplicate delivery (same eventId) is ignored before touching the payment', async () => {
      provider.verifyAndParseWebhook.mockReturnValue({
        eventId: 'tx-1-APPROVED-123',
        transaction: baseTransaction,
      });
      prisma.webhookEvent.create.mockRejectedValue(uniqueConstraintError());

      await service.handleWebhook({});

      expect(prisma.payment.findUnique).not.toHaveBeenCalled();
    });

    it('logs and returns when the reference does not match any known payment', async () => {
      provider.verifyAndParseWebhook.mockReturnValue({
        eventId: 'tx-1-APPROVED-123',
        transaction: baseTransaction,
      });
      prisma.payment.findUnique.mockResolvedValue(null);

      await service.handleWebhook({});

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses to process when amount or currency does not match the stored payment', async () => {
      provider.verifyAndParseWebhook.mockReturnValue({
        eventId: 'tx-1-APPROVED-123',
        transaction: { ...baseTransaction, amountInCents: 1 },
      });
      prisma.payment.findUnique.mockResolvedValue(basePayment);

      await service.handleWebhook({});

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('does nothing for a PENDING transaction status', async () => {
      provider.verifyAndParseWebhook.mockReturnValue({
        eventId: 'tx-1-PENDING-123',
        transaction: { ...baseTransaction, status: 'PENDING' },
      });
      prisma.payment.findUnique.mockResolvedValue(basePayment);

      await service.handleWebhook({});

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('approves the payment, marks the order PAID, and credits the wallet exactly once', async () => {
      provider.verifyAndParseWebhook.mockReturnValue({
        eventId: 'tx-1-APPROVED-123',
        transaction: baseTransaction,
      });
      prisma.payment.findUnique.mockResolvedValue(basePayment);
      prisma.payment.updateMany.mockResolvedValue({ count: 1 });
      prisma.order.findUniqueOrThrow.mockResolvedValue(baseOrder);

      await service.handleWebhook({});

      expect(prisma.payment.updateMany).toHaveBeenCalledWith({
        where: { id: 'payment-1', status: 'PENDING' },
        data: { status: 'APPROVED', providerTransactionId: 'tx-1' },
      });
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        data: { status: 'PAID' },
      });
      expect(walletService.creditPurchase).toHaveBeenCalledWith(
        prisma,
        'user-1',
        'order-1',
        50,
      );
    });

    it('is idempotent on a repeated APPROVED delivery: does not re-credit once the payment is no longer PENDING', async () => {
      provider.verifyAndParseWebhook.mockReturnValue({
        eventId: 'tx-1-APPROVED-456',
        transaction: baseTransaction,
      });
      prisma.payment.findUnique.mockResolvedValue({
        ...basePayment,
        status: 'APPROVED',
      });
      prisma.payment.updateMany.mockResolvedValue({ count: 0 });

      await service.handleWebhook({});

      expect(walletService.creditPurchase).not.toHaveBeenCalled();
      expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it('marks a DECLINED transaction terminal and cancels the still-pending order', async () => {
      provider.verifyAndParseWebhook.mockReturnValue({
        eventId: 'tx-1-DECLINED-123',
        transaction: { ...baseTransaction, status: 'DECLINED' },
      });
      prisma.payment.findUnique.mockResolvedValue(basePayment);
      prisma.payment.updateMany.mockResolvedValue({ count: 1 });

      await service.handleWebhook({});

      expect(prisma.payment.updateMany).toHaveBeenCalledWith({
        where: { id: 'payment-1', status: 'PENDING' },
        data: { status: 'DECLINED', providerTransactionId: 'tx-1' },
      });
      expect(prisma.order.updateMany).toHaveBeenCalledWith({
        where: { id: 'order-1', status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
      expect(walletService.creditPurchase).not.toHaveBeenCalled();
    });
  });

  describe('confirmFromReturn', () => {
    it('throws NotFoundException when the order does not belong to the user', async () => {
      prisma.order.findFirst.mockResolvedValue(null);

      await expect(
        service.confirmFromReturn('user-1', 'order-1', 'tx-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(provider.fetchTransaction).not.toHaveBeenCalled();
    });

    it('does nothing when there is no PENDING payment left to reconcile', async () => {
      prisma.order.findFirst.mockResolvedValue(baseOrder);
      prisma.payment.findFirst.mockResolvedValue(null);

      await service.confirmFromReturn('user-1', 'order-1', 'tx-1');

      expect(provider.fetchTransaction).not.toHaveBeenCalled();
    });

    it('does nothing when Wompi has no matching transaction, or its reference does not match', async () => {
      prisma.order.findFirst.mockResolvedValue(baseOrder);
      prisma.payment.findFirst.mockResolvedValue(basePayment);
      provider.fetchTransaction.mockResolvedValue({
        ...baseTransaction,
        reference: 'some-other-reference',
      });

      await service.confirmFromReturn('user-1', 'order-1', 'tx-1');

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses to process when amount or currency does not match the stored payment', async () => {
      prisma.order.findFirst.mockResolvedValue(baseOrder);
      prisma.payment.findFirst.mockResolvedValue(basePayment);
      provider.fetchTransaction.mockResolvedValue({
        ...baseTransaction,
        amountInCents: 1,
      });

      await service.confirmFromReturn('user-1', 'order-1', 'tx-1');

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('approves the payment and credits the wallet exactly once, same as the webhook path', async () => {
      prisma.order.findFirst.mockResolvedValue(baseOrder);
      prisma.payment.findFirst.mockResolvedValue(basePayment);
      provider.fetchTransaction.mockResolvedValue(baseTransaction);
      prisma.payment.updateMany.mockResolvedValue({ count: 1 });
      prisma.order.findUniqueOrThrow.mockResolvedValue(baseOrder);

      await service.confirmFromReturn('user-1', 'order-1', 'tx-1');

      expect(provider.fetchTransaction).toHaveBeenCalledWith('tx-1');
      expect(prisma.payment.updateMany).toHaveBeenCalledWith({
        where: { id: 'payment-1', status: 'PENDING' },
        data: { status: 'APPROVED', providerTransactionId: 'tx-1' },
      });
      expect(walletService.creditPurchase).toHaveBeenCalledWith(
        prisma,
        'user-1',
        'order-1',
        50,
      );
    });

    it('is idempotent if the webhook already approved the payment in the meantime', async () => {
      prisma.order.findFirst.mockResolvedValue(baseOrder);
      prisma.payment.findFirst.mockResolvedValue(basePayment);
      provider.fetchTransaction.mockResolvedValue(baseTransaction);
      prisma.payment.updateMany.mockResolvedValue({ count: 0 });

      await service.confirmFromReturn('user-1', 'order-1', 'tx-1');

      expect(walletService.creditPurchase).not.toHaveBeenCalled();
    });
  });
});
