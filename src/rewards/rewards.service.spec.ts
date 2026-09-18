import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AD_CALLBACK_VERIFIERS } from './ad-callback-verifier.interface';
import { RewardsService } from './rewards.service';

const STUB_SECRET = 'test-stub-secret';

function makeStubVerifier() {
  return {
    providerName: 'stub',
    verify: jest.fn((params: Record<string, string>) => {
      if (!params.sessionId || params.secret !== STUB_SECRET) {
        throw new UnauthorizedException(
          'Firma de callback de publicidad inválida.',
        );
      }
      return { externalSessionId: params.sessionId };
    }),
  };
}

describe('RewardsService', () => {
  let service: RewardsService;
  let prisma: {
    rewardSession: {
      create: jest.Mock;
      findUnique: jest.Mock;
      updateMany: jest.Mock;
    };
    rewardTransaction: { create: jest.Mock; count: jest.Mock };
    rewardProgress: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
      updateMany: jest.Mock;
    };
    analyticsEvent: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let stubVerifier: ReturnType<typeof makeStubVerifier>;
  let configService: { get: jest.Mock };

  const baseSession = {
    id: 'session-1',
    userId: 'user-1',
    rewardType: 'TAROT_READING_UNLOCK' as const,
    provider: 'stub',
    status: 'CREATED' as const,
    idempotencyKey: 'idem-1',
    createdAt: new Date(),
    completedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
  };

  beforeEach(async () => {
    prisma = {
      rewardSession: {
        create: jest.fn().mockResolvedValue(baseSession),
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      rewardTransaction: {
        create: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
      },
      rewardProgress: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      analyticsEvent: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(async (fn) => fn(prisma)),
    };
    stubVerifier = makeStubVerifier();
    configService = {
      get: jest.fn((key: string) => {
        if (key === 'REWARDS_STUB_SECRET') return STUB_SECRET;
        if (key === 'NODE_ENV') return 'test';
        return undefined;
      }),
    };

    const module = await Test.createTestingModule({
      providers: [
        RewardsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: configService },
        { provide: AD_CALLBACK_VERIFIERS, useValue: [stubVerifier] },
      ],
    }).compile();

    service = module.get(RewardsService);
  });

  describe('createSession', () => {
    it('creates a RewardSession with an expiry and logs ad_requested', async () => {
      const result = await service.createSession(
        'user-1',
        'TAROT_READING_UNLOCK',
      );

      expect(prisma.rewardSession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            rewardType: 'TAROT_READING_UNLOCK',
            provider: 'stub',
          }),
        }),
      );
      expect(prisma.analyticsEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'ad_requested',
            userId: 'user-1',
          }),
        }),
      );
      expect(result.id).toBe('session-1');
    });

    it('validates the daily flash-offer limit before creating a new session', async () => {
      prisma.rewardTransaction.count.mockResolvedValue(2); // ya se ganó 1 ciclo hoy (2 anuncios)

      await expect(
        service.createSession('user-1', 'FLASH_OFFER_UNLOCK'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.rewardSession.create).not.toHaveBeenCalled();
    });

    it('allows creating a flash-offer session when today has not reached the limit', async () => {
      prisma.rewardTransaction.count.mockResolvedValue(1); // a mitad de un ciclo

      await service.createSession('user-1', 'FLASH_OFFER_UNLOCK');

      expect(prisma.rewardSession.create).toHaveBeenCalled();
    });
  });

  describe('processProviderCallback', () => {
    it('completes a valid session, creates the transaction and increments progress', async () => {
      prisma.rewardSession.findUnique.mockResolvedValue(baseSession);

      const result = await service.processProviderCallback('stub', {
        sessionId: 'session-1',
        secret: STUB_SECRET,
      });

      expect(result).toEqual({ granted: true });
      expect(prisma.rewardTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            rewardSessionId: 'session-1',
            rewardType: 'TAROT_READING_UNLOCK',
          }),
        }),
      );
      expect(prisma.rewardProgress.upsert).toHaveBeenCalled();
      expect(prisma.analyticsEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'reward_granted' }),
        }),
      );
    });

    it('rejects an invalid signature without touching the session', async () => {
      await expect(
        service.processProviderCallback('stub', {
          sessionId: 'session-1',
          secret: 'wrong-secret',
        }),
      ).rejects.toThrow('Firma de callback de publicidad inválida.');

      expect(prisma.rewardSession.findUnique).not.toHaveBeenCalled();
    });

    it('throws when the provider is not registered', async () => {
      await expect(
        service.processProviderCallback('unknown-provider', {}),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects when the session does not exist', async () => {
      prisma.rewardSession.findUnique.mockResolvedValue(null);

      const result = await service.processProviderCallback('stub', {
        sessionId: 'missing-session',
        secret: STUB_SECRET,
      });

      expect(result).toEqual({ granted: false, reason: 'session_not_found' });
    });

    it('never grants a reward twice for the same session (idempotent)', async () => {
      prisma.rewardSession.findUnique.mockResolvedValue({
        ...baseSession,
        status: 'COMPLETED',
      });

      const result = await service.processProviderCallback('stub', {
        sessionId: 'session-1',
        secret: STUB_SECRET,
      });

      expect(result).toEqual({ granted: false, reason: 'already_completed' });
      expect(prisma.rewardTransaction.create).not.toHaveBeenCalled();
    });

    it('rejects reusing a session that already failed or was rejected', async () => {
      prisma.rewardSession.findUnique.mockResolvedValue({
        ...baseSession,
        status: 'REJECTED',
      });

      const result = await service.processProviderCallback('stub', {
        sessionId: 'session-1',
        secret: STUB_SECRET,
      });

      expect(result).toEqual({
        granted: false,
        reason: 'session_not_reusable',
      });
      expect(prisma.rewardTransaction.create).not.toHaveBeenCalled();
    });

    it('expires a session past its expiresAt instead of granting the reward', async () => {
      prisma.rewardSession.findUnique.mockResolvedValue({
        ...baseSession,
        expiresAt: new Date(Date.now() - 1000),
      });

      const result = await service.processProviderCallback('stub', {
        sessionId: 'session-1',
        secret: STUB_SECRET,
      });

      expect(result).toEqual({ granted: false, reason: 'session_expired' });
      expect(prisma.rewardSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'EXPIRED' } }),
      );
      expect(prisma.rewardTransaction.create).not.toHaveBeenCalled();
    });

    it('handles a concurrent completion race without double-granting', async () => {
      prisma.rewardSession.findUnique.mockResolvedValue(baseSession);
      // Otra request ya completó la sesión justo antes de esta transacción.
      prisma.rewardSession.updateMany.mockResolvedValueOnce({ count: 0 });

      const result = await service.processProviderCallback('stub', {
        sessionId: 'session-1',
        secret: STUB_SECRET,
      });

      expect(result).toEqual({ granted: false, reason: 'already_completed' });
      expect(prisma.rewardTransaction.create).not.toHaveBeenCalled();
    });
  });

  describe('getProgress', () => {
    it('reports the configured threshold per reward type and whether it is reached', async () => {
      prisma.rewardProgress.findUnique.mockResolvedValue({ currentCount: 3 });

      const progress = await service.getProgress(
        'user-1',
        'TAROT_READING_UNLOCK',
      );

      expect(progress).toEqual({
        rewardType: 'TAROT_READING_UNLOCK',
        currentCount: 3,
        requiredCount: 5,
        unlocked: false,
      });
    });

    it('reports unlocked once the count reaches the required threshold', async () => {
      prisma.rewardProgress.findUnique.mockResolvedValue({ currentCount: 1 });

      const progress = await service.getProgress('user-1', 'DAILY_CARD_UNLOCK');

      expect(progress.unlocked).toBe(true);
    });
  });

  describe('tryConsumeUnlock', () => {
    it('resets the counter and returns true when the threshold is still reached', async () => {
      prisma.rewardProgress.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.tryConsumeUnlock(
        'user-1',
        'DAILY_CARD_UNLOCK',
      );

      expect(result).toBe(true);
      expect(prisma.rewardProgress.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          rewardType: 'DAILY_CARD_UNLOCK',
          currentCount: { gte: 1 },
        },
        data: { currentCount: 0 },
      });
    });

    it('returns false without resetting anything when the threshold is not reached', async () => {
      prisma.rewardProgress.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.tryConsumeUnlock(
        'user-1',
        'TAROT_READING_UNLOCK',
      );

      expect(result).toBe(false);
    });

    it('accepts an external transaction client so callers can consume atomically alongside their own writes', async () => {
      const tx = {
        rewardProgress: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };

      const result = await service.tryConsumeUnlock(
        'user-1',
        'TAROT_READING_UNLOCK',
        tx as never,
      );

      expect(result).toBe(true);
      expect(tx.rewardProgress.updateMany).toHaveBeenCalled();
      expect(prisma.rewardProgress.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('simulateStubCompletion', () => {
    it('grants the reward through the exact same verification path as a real callback', async () => {
      prisma.rewardSession.findUnique.mockResolvedValue(baseSession);

      const result = await service.simulateStubCompletion(
        'user-1',
        'session-1',
      );

      expect(result).toEqual({ granted: true });
      expect(stubVerifier.verify).toHaveBeenCalledWith({
        sessionId: 'session-1',
        secret: STUB_SECRET,
      });
    });

    it('refuses to simulate a session that belongs to another user', async () => {
      prisma.rewardSession.findUnique.mockResolvedValue({
        ...baseSession,
        userId: 'someone-else',
      });

      await expect(
        service.simulateStubCompletion('user-1', 'session-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('is disabled in production', async () => {
      configService.get.mockImplementation((key: string) =>
        key === 'NODE_ENV' ? 'production' : STUB_SECRET,
      );

      await expect(
        service.simulateStubCompletion('user-1', 'session-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.rewardSession.findUnique).not.toHaveBeenCalled();
    });
  });
});
