import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AdminMetricsService } from './admin-metrics.service';

describe('AdminMetricsService', () => {
  let service: AdminMetricsService;
  let prisma: {
    user: { count: jest.Mock };
    reading: { groupBy: jest.Mock; count: jest.Mock };
    order: { aggregate: jest.Mock; findMany: jest.Mock };
    aIExecution: { count: jest.Mock; aggregate: jest.Mock };
    service: { findMany: jest.Mock };
    tarotDraw: { count: jest.Mock };
    walletTransaction: { aggregate: jest.Mock };
    rewardSession: { groupBy: jest.Mock };
    rewardTransaction: { findMany: jest.Mock };
  };
  let configService: { get: jest.Mock };

  const TAROT_SERVICES = [
    { id: 'svc-3', code: 'TAROT_THREE' },
    { id: 'svc-5', code: 'TAROT_FIVE' },
    { id: 'svc-10', code: 'TAROT_TEN' },
  ];

  beforeEach(async () => {
    prisma = {
      user: { count: jest.fn().mockResolvedValue(0) },
      reading: {
        groupBy: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      order: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { priceCents: null },
          _count: { _all: 0 },
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      aIExecution: {
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { costEstimateUsd: null } }),
      },
      service: { findMany: jest.fn().mockResolvedValue(TAROT_SERVICES) },
      tarotDraw: { count: jest.fn().mockResolvedValue(0) },
      walletTransaction: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { amount: null }, _count: { _all: 0 } }),
      },
      rewardSession: { groupBy: jest.fn().mockResolvedValue([]) },
      rewardTransaction: { findMany: jest.fn().mockResolvedValue([]) },
    };
    configService = { get: jest.fn().mockReturnValue(4000) };

    const module = await Test.createTestingModule({
      providers: [
        AdminMetricsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get(AdminMetricsService);
  });

  it('returns zeroed-out metrics on an empty database without dividing by zero', async () => {
    const metrics = await service.getMetrics();

    expect(metrics.conversionRate).toBe(0);
    expect(metrics.avgCardsPerReading).toBe(0);
    expect(metrics.avgCreditsPerTarotReading).toBe(0);
    expect(metrics.readingsPerUser).toBe(0);
    expect(metrics.rewardFunnel.completionRate).toBe(0);
    expect(metrics.adToPurchaseConversionRate).toBe(0);
    expect(metrics.tarotDepthBreakdown).toEqual([]);
  });

  it('computes the tarot depth breakdown, ordered from quickest to deepest, with real percentages', async () => {
    prisma.reading.groupBy.mockImplementation(
      async (args: { by: string[] }) => {
        if (args.by[0] === 'serviceId') {
          return [
            { serviceId: 'svc-10', _count: { _all: 1 } },
            { serviceId: 'svc-3', _count: { _all: 6 } },
            { serviceId: 'svc-5', _count: { _all: 3 } },
          ];
        }
        return [];
      },
    );

    const metrics = await service.getMetrics();

    expect(metrics.tarotDepthBreakdown).toEqual([
      { code: 'TAROT_THREE', readingsCount: 6, percentage: 0.6 },
      { code: 'TAROT_FIVE', readingsCount: 3, percentage: 0.3 },
      { code: 'TAROT_TEN', readingsCount: 1, percentage: 0.1 },
    ]);
  });

  it('computes the weighted average of cards per reading from real draws, not a hardcoded spread size', async () => {
    prisma.tarotDraw.count.mockResolvedValue(29); // 6*3 + 3*5 + 1*10 = 43... usamos un total simple
    prisma.reading.count.mockImplementation(
      async (args?: { where?: { draws?: unknown } }) => {
        if (args?.where?.draws) return 10;
        return 0;
      },
    );

    const metrics = await service.getMetrics();

    expect(metrics.avgCardsPerReading).toBeCloseTo(2.9);
  });

  it('computes the average credits per tarot reading from the real wallet ledger, including free ad-unlocked reads as zero', async () => {
    prisma.walletTransaction.aggregate.mockResolvedValue({
      _sum: { amount: -46 }, // negativo, como se guarda una reserva
      _count: { _all: 5 },
    });

    const metrics = await service.getMetrics();

    expect(metrics.avgCreditsPerTarotReading).toBeCloseTo(9.2);
  });

  it('computes readings per user from total tarot readings over total users', async () => {
    prisma.user.count.mockResolvedValue(4);
    prisma.reading.count.mockImplementation(
      async (args?: { where?: { service?: unknown } }) => {
        if (args?.where?.service) return 12;
        return 0;
      },
    );

    const metrics = await service.getMetrics();

    expect(metrics.readingsPerUser).toBe(3);
  });

  it('computes the reward funnel per type and overall, from real reward sessions', async () => {
    prisma.rewardSession.groupBy.mockImplementation(
      async (args: { where?: { status?: string } }) => {
        if (args.where?.status === 'COMPLETED') {
          return [
            { rewardType: 'DAILY_CARD_UNLOCK', _count: { _all: 8 } },
            { rewardType: 'TAROT_READING_UNLOCK', _count: { _all: 5 } },
          ];
        }
        return [
          { rewardType: 'DAILY_CARD_UNLOCK', _count: { _all: 10 } },
          { rewardType: 'TAROT_READING_UNLOCK', _count: { _all: 10 } },
          { rewardType: 'FLASH_OFFER_UNLOCK', _count: { _all: 4 } },
        ];
      },
    );

    const metrics = await service.getMetrics();

    expect(metrics.rewardFunnel.sessionsCreated).toBe(24);
    expect(metrics.rewardFunnel.sessionsCompleted).toBe(13);
    expect(metrics.rewardFunnel.completionRate).toBeCloseTo(13 / 24);
    expect(metrics.rewardFunnel.byType.DAILY_CARD_UNLOCK).toEqual({
      sessionsCreated: 10,
      sessionsCompleted: 8,
      completionRate: 0.8,
    });
    expect(metrics.rewardFunnel.byType.FLASH_OFFER_UNLOCK).toEqual({
      sessionsCreated: 4,
      sessionsCompleted: 0,
      completionRate: 0,
    });
  });

  it('computes the ad-to-purchase conversion as the share of ever-rewarded users who also paid', async () => {
    prisma.rewardTransaction.findMany.mockResolvedValue([
      { userId: 'user-1' },
      { userId: 'user-2' },
      { userId: 'user-3' },
      { userId: 'user-4' },
    ]);
    prisma.order.findMany.mockImplementation(
      async (args: { where?: { status?: string } }) => {
        if (args.where?.status === 'PAID') {
          return [{ userId: 'user-1' }, { userId: 'user-3' }];
        }
        return [];
      },
    );

    const metrics = await service.getMetrics();

    expect(metrics.adToPurchaseConversionRate).toBe(0.5);
  });
});
