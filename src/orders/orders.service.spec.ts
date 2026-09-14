import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CreditPackagesService } from '../credit-packages/credit-packages.service';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from './orders.service';

describe('OrdersService', () => {
  let service: OrdersService;
  let txOrderCreate: jest.Mock;
  let txFlashOfferFindFirst: jest.Mock;
  let txFlashOfferUpdateMany: jest.Mock;
  let prisma: {
    order: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let creditPackagesService: { findActiveByCode: jest.Mock };

  const basePackage = {
    id: 'pkg-1',
    code: 'STARTER',
    credits: 50,
    priceCents: 990000,
    currency: 'COP',
  };

  const baseOrder = {
    id: 'order-1',
    userId: 'user-1',
    creditPackageId: 'pkg-1',
    credits: 50,
    priceCents: 990000,
    discountAppliedPercent: null,
    currency: 'COP',
    status: 'PENDING',
    createdAt: new Date(),
  };

  beforeEach(async () => {
    txOrderCreate = jest.fn().mockResolvedValue(baseOrder);
    txFlashOfferFindFirst = jest.fn().mockResolvedValue(null);
    txFlashOfferUpdateMany = jest.fn().mockResolvedValue({ count: 1 });

    prisma = {
      order: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      $transaction: jest.fn(async (callback: (tx: unknown) => unknown) =>
        callback({
          order: { create: txOrderCreate },
          flashOfferUnlock: {
            findFirst: txFlashOfferFindFirst,
            updateMany: txFlashOfferUpdateMany,
          },
        }),
      ),
    };
    creditPackagesService = { findActiveByCode: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: prisma },
        { provide: CreditPackagesService, useValue: creditPackagesService },
      ],
    }).compile();

    service = module.get(OrdersService);
  });

  describe('create', () => {
    it('freezes the price and credits copied from the package at creation time', async () => {
      creditPackagesService.findActiveByCode.mockResolvedValue(basePackage);

      const result = await service.create('user-1', 'STARTER');

      expect(txFlashOfferFindFirst).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          packageCode: 'STARTER',
          consumedAt: null,
          expiresAt: { gt: expect.any(Date) },
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(txOrderCreate).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          creditPackageId: 'pkg-1',
          credits: 50,
          priceCents: 990000,
          discountAppliedPercent: null,
          currency: 'COP',
          status: 'PENDING',
        },
      });
      expect(result).toEqual({
        id: 'order-1',
        status: 'PENDING',
        credits: 50,
        priceCents: 990000,
        discountAppliedPercent: null,
        currency: 'COP',
        createdAt: baseOrder.createdAt,
      });
    });

    it('propagates NotFoundException when the package code does not resolve', async () => {
      creditPackagesService.findActiveByCode.mockRejectedValue(
        new NotFoundException('Paquete de créditos no encontrado.'),
      );

      await expect(service.create('user-1', 'UNKNOWN')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('applies and consumes an active flash offer for the matching package', async () => {
      creditPackagesService.findActiveByCode.mockResolvedValue(basePackage);
      const activeOffer = {
        id: 'offer-1',
        userId: 'user-1',
        packageCode: 'STARTER',
        discountPercent: 20,
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: null,
        createdAt: new Date(),
      };
      txFlashOfferFindFirst.mockResolvedValue(activeOffer);
      txOrderCreate.mockResolvedValue({
        ...baseOrder,
        priceCents: 792000,
        discountAppliedPercent: 20,
      });

      const result = await service.create('user-1', 'STARTER');

      expect(txFlashOfferUpdateMany).toHaveBeenCalledWith({
        where: { id: 'offer-1', consumedAt: null },
        data: { consumedAt: expect.any(Date) },
      });
      expect(txOrderCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          priceCents: 792000,
          discountAppliedPercent: 20,
        }),
      });
      expect(result.priceCents).toBe(792000);
      expect(result.discountAppliedPercent).toBe(20);
    });

    it('does not apply a discount when the offer was already consumed by a concurrent order', async () => {
      creditPackagesService.findActiveByCode.mockResolvedValue(basePackage);
      txFlashOfferFindFirst.mockResolvedValue({
        id: 'offer-1',
        userId: 'user-1',
        packageCode: 'STARTER',
        discountPercent: 20,
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: null,
        createdAt: new Date(),
      });
      // El updateMany no afectó ninguna fila: otra orden concurrente ya la
      // había consumido justo antes.
      txFlashOfferUpdateMany.mockResolvedValue({ count: 0 });

      await service.create('user-1', 'STARTER');

      expect(txOrderCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          priceCents: 990000,
          discountAppliedPercent: null,
        }),
      });
    });

    it('ignores an active flash offer for a different package', async () => {
      creditPackagesService.findActiveByCode.mockResolvedValue(basePackage);
      // El mock de findFirst ya filtra por packageCode en la llamada real;
      // aquí simulamos que Prisma no encontró ninguna coincidencia.
      txFlashOfferFindFirst.mockResolvedValue(null);

      await service.create('user-1', 'STARTER');

      expect(txFlashOfferUpdateMany).not.toHaveBeenCalled();
      expect(txOrderCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          priceCents: 990000,
          discountAppliedPercent: null,
        }),
      });
    });
  });

  describe('findOneForUser', () => {
    it('scopes the lookup to the owning user', async () => {
      prisma.order.findFirst.mockResolvedValue(baseOrder);

      await service.findOneForUser('user-1', 'order-1');

      expect(prisma.order.findFirst).toHaveBeenCalledWith({
        where: { id: 'order-1', userId: 'user-1' },
      });
    });

    it('throws NotFoundException when the order does not belong to the user or does not exist', async () => {
      prisma.order.findFirst.mockResolvedValue(null);

      await expect(
        service.findOneForUser('user-1', 'someone-elses-order'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('listAll', () => {
    it('paginates across all users and includes userId for admin review', async () => {
      prisma.order.findMany.mockResolvedValue([baseOrder]);
      prisma.order.count.mockResolvedValue(1);

      const result = await service.listAll(1, 20);

      expect(prisma.order.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });
      expect(result).toEqual({
        items: [
          {
            id: 'order-1',
            status: 'PENDING',
            credits: 50,
            priceCents: 990000,
            discountAppliedPercent: null,
            currency: 'COP',
            createdAt: baseOrder.createdAt,
            userId: 'user-1',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      });
    });
  });
});
