import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CacheService } from '../cache/cache.service';
import { PrismaService } from '../prisma/prisma.service';
import { CREDIT_PACKAGES_LIST_CACHE_KEY } from './credit-packages.constants';
import { CreditPackagesService } from './credit-packages.service';

describe('CreditPackagesService', () => {
  let service: CreditPackagesService;
  let cache: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
  let prisma: {
    creditPackage: { findMany: jest.Mock; findFirst: jest.Mock };
  };

  const basePackage = {
    id: 'pkg-1',
    code: 'STARTER',
    name: 'Paquete inicial',
    description: null,
    credits: 50,
    priceCents: 990000,
    currency: 'COP',
    isActive: true,
    isRecommended: false,
  };

  beforeEach(async () => {
    prisma = {
      creditPackage: { findMany: jest.fn(), findFirst: jest.fn() },
    };
    cache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };

    const module = await Test.createTestingModule({
      providers: [
        CreditPackagesService,
        { provide: PrismaService, useValue: prisma },
        { provide: CacheService, useValue: cache },
      ],
    }).compile();

    service = module.get(CreditPackagesService);
  });

  describe('listActive', () => {
    it('returns the cached list without querying the database', async () => {
      cache.get.mockResolvedValue([{ code: 'CACHED' }]);

      const result = await service.listActive();

      expect(result).toEqual([{ code: 'CACHED' }]);
      expect(prisma.creditPackage.findMany).not.toHaveBeenCalled();
    });

    it('queries active packages ordered by price descending (efecto anclaje) and caches the mapped result', async () => {
      prisma.creditPackage.findMany.mockResolvedValue([basePackage]);

      const result = await service.listActive();

      expect(prisma.creditPackage.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { priceCents: 'desc' },
      });
      expect(result).toEqual([
        {
          code: 'STARTER',
          name: 'Paquete inicial',
          description: null,
          credits: 50,
          priceCents: 990000,
          currency: 'COP',
          isRecommended: false,
        },
      ]);
      expect(cache.set).toHaveBeenCalledWith(
        CREDIT_PACKAGES_LIST_CACHE_KEY,
        result,
        expect.any(Number),
      );
    });
  });

  describe('findActiveByCode', () => {
    it('returns the raw package when it exists and is active', async () => {
      prisma.creditPackage.findFirst.mockResolvedValue(basePackage);

      await expect(service.findActiveByCode('STARTER')).resolves.toEqual(
        basePackage,
      );
      expect(prisma.creditPackage.findFirst).toHaveBeenCalledWith({
        where: { code: 'STARTER', isActive: true },
      });
    });

    it('throws NotFoundException when the package does not exist or is inactive', async () => {
      prisma.creditPackage.findFirst.mockResolvedValue(null);

      await expect(service.findActiveByCode('UNKNOWN')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
