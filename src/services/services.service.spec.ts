import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CacheService } from '../cache/cache.service';
import { PrismaService } from '../prisma/prisma.service';
import { ServicesService } from './services.service';
import { SERVICES_LIST_CACHE_KEY } from './services.constants';

describe('ServicesService', () => {
  let service: ServicesService;
  let cache: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
  let txServiceFormUpdateMany: jest.Mock;
  let txServiceFormCreate: jest.Mock;
  let txServiceFindUniqueOrThrow: jest.Mock;
  let prisma: {
    service: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    serviceForm: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };

  const baseService = {
    id: 'service-1',
    code: 'TAROT_THREE',
    name: 'Tarot de tres cartas',
    description: 'desc',
    creditCost: 10,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    forms: [] as { version: number; schema: unknown }[],
  };

  beforeEach(async () => {
    txServiceFormUpdateMany = jest.fn().mockResolvedValue({});
    txServiceFormCreate = jest.fn().mockResolvedValue({});
    txServiceFindUniqueOrThrow = jest
      .fn()
      .mockResolvedValue({ ...baseService });

    prisma = {
      service: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      serviceForm: { findFirst: jest.fn() },
      $transaction: jest.fn(
        async (
          callback: (tx: {
            serviceForm: { updateMany: jest.Mock; create: jest.Mock };
            service: { findUniqueOrThrow: jest.Mock };
          }) => Promise<unknown>,
        ) =>
          callback({
            serviceForm: {
              updateMany: txServiceFormUpdateMany,
              create: txServiceFormCreate,
            },
            service: { findUniqueOrThrow: txServiceFindUniqueOrThrow },
          }),
      ),
    };

    cache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };

    const module = await Test.createTestingModule({
      providers: [
        ServicesService,
        { provide: PrismaService, useValue: prisma },
        { provide: CacheService, useValue: cache },
      ],
    }).compile();

    service = module.get(ServicesService);
  });

  describe('listActive', () => {
    it('returns the cached list without querying the database', async () => {
      cache.get.mockResolvedValue([{ code: 'DAILY_CARD' }]);

      const result = await service.listActive();

      expect(result).toEqual([{ code: 'DAILY_CARD' }]);
      expect(prisma.service.findMany).not.toHaveBeenCalled();
    });

    it('queries the database and caches the result on a miss', async () => {
      prisma.service.findMany.mockResolvedValue([baseService]);

      const result = await service.listActive();

      expect(result).toEqual([
        {
          code: 'TAROT_THREE',
          name: 'Tarot de tres cartas',
          description: 'desc',
          creditCost: 10,
          formSchema: null,
        },
      ]);
      expect(cache.set).toHaveBeenCalledWith(
        SERVICES_LIST_CACHE_KEY,
        result,
        expect.any(Number),
      );
    });
  });

  describe('findActiveByCode', () => {
    it('returns the mapped service including the active form schema', async () => {
      prisma.service.findFirst.mockResolvedValue({
        ...baseService,
        forms: [{ version: 1, schema: { fields: [] } }],
      });

      const result = await service.findActiveByCode('TAROT_THREE');

      expect(result.formSchema).toEqual({ fields: [] });
    });

    it('throws NotFoundException when the service does not exist or is inactive', async () => {
      prisma.service.findFirst.mockResolvedValue(null);

      await expect(service.findActiveByCode('UNKNOWN')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('updates the service and invalidates the list cache', async () => {
      prisma.service.findUnique.mockResolvedValue(baseService);
      prisma.service.update.mockResolvedValue({
        ...baseService,
        creditCost: 20,
      });

      const result = await service.update('service-1', { creditCost: 20 });

      expect(result.creditCost).toBe(20);
      expect(cache.del).toHaveBeenCalledWith(SERVICES_LIST_CACHE_KEY);
    });

    it('throws NotFoundException when the service does not exist', async () => {
      prisma.service.findUnique.mockResolvedValue(null);

      await expect(
        service.update('missing', { creditCost: 1 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('publishForm', () => {
    it('creates version 1 when the service has no prior form versions', async () => {
      prisma.service.findUnique.mockResolvedValue(baseService);
      prisma.serviceForm.findFirst.mockResolvedValue(null);

      await service.publishForm('service-1', { fields: [] });

      expect(txServiceFormCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ version: 1, isActive: true }),
        }),
      );
      expect(cache.del).toHaveBeenCalledWith(SERVICES_LIST_CACHE_KEY);
    });

    it('deactivates the previous version and increments the version number', async () => {
      prisma.service.findUnique.mockResolvedValue(baseService);
      prisma.serviceForm.findFirst.mockResolvedValue({ version: 3 });

      await service.publishForm('service-1', { fields: [] });

      expect(txServiceFormUpdateMany).toHaveBeenCalledWith({
        where: { serviceId: 'service-1', isActive: true },
        data: { isActive: false },
      });
      expect(txServiceFormCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ version: 4 }),
        }),
      );
    });

    it('throws NotFoundException when the service does not exist', async () => {
      prisma.service.findUnique.mockResolvedValue(null);

      await expect(
        service.publishForm('missing', { fields: [] }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
