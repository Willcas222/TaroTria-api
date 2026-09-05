import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CreditPackagesService } from '../credit-packages/credit-packages.service';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from './orders.service';

describe('OrdersService', () => {
  let service: OrdersService;
  let prisma: {
    order: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
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
    currency: 'COP',
    status: 'PENDING',
    createdAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      order: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
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
      prisma.order.create.mockResolvedValue(baseOrder);

      const result = await service.create('user-1', 'STARTER');

      expect(prisma.order.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          creditPackageId: 'pkg-1',
          credits: 50,
          priceCents: 990000,
          currency: 'COP',
          status: 'PENDING',
        },
      });
      expect(result).toEqual({
        id: 'order-1',
        status: 'PENDING',
        credits: 50,
        priceCents: 990000,
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
      expect(prisma.order.create).not.toHaveBeenCalled();
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
