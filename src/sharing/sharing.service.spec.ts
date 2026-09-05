import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { SHARE_IMAGE_QUEUE } from '../queues/queues.module';
import { StorageService } from '../storage/storage.service';
import { SharingService } from './sharing.service';

describe('SharingService', () => {
  let service: SharingService;
  let prisma: {
    reading: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
    };
    shareLink: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    analyticsEvent: { create: jest.Mock };
  };
  let storageService: { downloadObject: jest.Mock };
  let configService: { get: jest.Mock };
  let shareImageQueue: { add: jest.Mock };

  const completedTarotReading = {
    id: 'reading-1',
    userId: 'user-1',
    status: 'COMPLETED',
    service: { code: 'TAROT_THREE' },
    spread: {
      positions: [
        { code: 'PAST', label: 'Pasado', orderIndex: 0 },
        { code: 'PRESENT', label: 'Presente', orderIndex: 1 },
      ],
    },
    draws: [
      {
        position: 'PRESENT',
        orientation: 'REVERSED',
        card: { name: 'La Torre', arcana: 'MAJOR', suit: null },
      },
      {
        position: 'PAST',
        orientation: 'UPRIGHT',
        card: { name: 'El Sol', arcana: 'MAJOR', suit: null },
      },
    ],
  };

  const completedPalmReading = {
    id: 'reading-palm-1',
    userId: 'user-1',
    status: 'COMPLETED',
    service: { code: 'PALM_BASIC' },
    spread: null,
    draws: [],
  };

  const activeShareLink = {
    id: 'share-1',
    readingId: 'reading-1',
    imageKey: null,
    imageStatus: 'PENDING' as const,
    revokedAt: null,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      reading: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      shareLink: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      analyticsEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    storageService = { downloadObject: jest.fn() };
    configService = {
      get: jest.fn((key: string) =>
        key === 'app.url'
          ? 'https://app.example.com'
          : key === 'app.apiUrl'
            ? 'https://api.example.com'
            : undefined,
      ),
    };
    shareImageQueue = { add: jest.fn().mockResolvedValue({}) };

    const module = await Test.createTestingModule({
      providers: [
        SharingService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: configService },
        { provide: StorageService, useValue: storageService },
        {
          provide: getQueueToken(SHARE_IMAGE_QUEUE),
          useValue: shareImageQueue,
        },
      ],
    }).compile();

    service = module.get(SharingService);
  });

  describe('createShareLink', () => {
    it('throws NotFoundException when the reading does not belong to the user', async () => {
      prisma.reading.findFirst.mockResolvedValue(null);

      await expect(
        service.createShareLink('user-1', 'reading-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequestException when the reading is not COMPLETED', async () => {
      prisma.reading.findFirst.mockResolvedValue({
        ...completedTarotReading,
        status: 'PENDING',
      });

      await expect(
        service.createShareLink('user-1', 'reading-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns the existing active link instead of creating a new one', async () => {
      prisma.reading.findFirst.mockResolvedValue(completedTarotReading);
      prisma.shareLink.findFirst.mockResolvedValue(activeShareLink);

      const result = await service.createShareLink('user-1', 'reading-1');

      expect(result).toEqual({
        token: 'share-1',
        url: 'https://app.example.com/r/share-1',
        imageStatus: 'PENDING',
      });
      expect(prisma.shareLink.create).not.toHaveBeenCalled();
      expect(shareImageQueue.add).not.toHaveBeenCalled();
    });

    it('creates a new link, enqueues the image job, and logs SHARE_CREATED', async () => {
      prisma.reading.findFirst.mockResolvedValue(completedTarotReading);
      prisma.shareLink.findFirst.mockResolvedValue(null);
      prisma.shareLink.create.mockResolvedValue(activeShareLink);

      const result = await service.createShareLink('user-1', 'reading-1');

      expect(prisma.shareLink.create).toHaveBeenCalledWith({
        data: { readingId: 'reading-1' },
      });
      expect(shareImageQueue.add).toHaveBeenCalledWith(
        'GENERATE_SHARE_IMAGE',
        { shareLinkId: 'share-1' },
        { jobId: 'GENERATE_SHARE_IMAGE-share-1' },
      );
      expect(prisma.analyticsEvent.create).toHaveBeenCalledWith({
        data: { type: 'SHARE_CREATED', shareLinkId: 'share-1', userId: null },
      });
      expect(result.token).toBe('share-1');
    });
  });

  describe('revokeShareLink', () => {
    it('throws NotFoundException when the reading does not belong to the user', async () => {
      prisma.reading.findFirst.mockResolvedValue(null);

      await expect(
        service.revokeShareLink('user-1', 'reading-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('does nothing when there is no active link', async () => {
      prisma.reading.findFirst.mockResolvedValue(completedTarotReading);
      prisma.shareLink.findFirst.mockResolvedValue(null);

      await service.revokeShareLink('user-1', 'reading-1');

      expect(prisma.shareLink.update).not.toHaveBeenCalled();
    });

    it('revokes the active link and logs SHARE_REVOKED', async () => {
      prisma.reading.findFirst.mockResolvedValue(completedTarotReading);
      prisma.shareLink.findFirst.mockResolvedValue(activeShareLink);

      await service.revokeShareLink('user-1', 'reading-1');

      expect(prisma.shareLink.update).toHaveBeenCalledWith({
        where: { id: 'share-1' },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.analyticsEvent.create).toHaveBeenCalledWith({
        data: { type: 'SHARE_REVOKED', shareLinkId: 'share-1', userId: null },
      });
    });
  });

  describe('getPublicSummary', () => {
    it('throws NotFoundException when the link does not exist', async () => {
      prisma.shareLink.findFirst.mockResolvedValue(null);

      await expect(service.getPublicSummary('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws NotFoundException when the reading is no longer COMPLETED (revoked-equivalent)', async () => {
      prisma.shareLink.findFirst.mockResolvedValue(activeShareLink);
      prisma.reading.findUnique.mockResolvedValue({
        ...completedTarotReading,
        status: 'FAILED',
      });

      await expect(service.getPublicSummary('share-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns sanitized cards (no interpretation text) ordered by spread position, and logs SHARE_VIEWED', async () => {
      prisma.shareLink.findFirst.mockResolvedValue(activeShareLink);
      prisma.reading.findUnique.mockResolvedValue(completedTarotReading);
      prisma.reading.findUniqueOrThrow.mockResolvedValue(completedTarotReading);

      const result = await service.getPublicSummary('share-1');

      expect(result.readingType).toBe('TAROT');
      expect(result.title).toBe('Hice una lectura de tarot en TAROTRIA');
      expect(result.cards).toEqual([
        {
          position: 'PAST',
          positionLabel: 'Pasado',
          cardName: 'El Sol',
          arcana: 'MAJOR',
          suit: null,
          orientation: 'UPRIGHT',
        },
        {
          position: 'PRESENT',
          positionLabel: 'Presente',
          cardName: 'La Torre',
          arcana: 'MAJOR',
          suit: null,
          orientation: 'REVERSED',
        },
      ]);
      expect(result.imageUrl).toBeNull();
      expect(prisma.analyticsEvent.create).toHaveBeenCalledWith({
        data: { type: 'SHARE_VIEWED', shareLinkId: 'share-1', userId: null },
      });
    });

    it('never includes AI-generated interpretation text or the private question', async () => {
      prisma.shareLink.findFirst.mockResolvedValue(activeShareLink);
      prisma.reading.findUnique.mockResolvedValue(completedTarotReading);
      prisma.reading.findUniqueOrThrow.mockResolvedValue(completedTarotReading);

      const result = await service.getPublicSummary('share-1');

      expect(JSON.stringify(result)).not.toContain('summary');
      expect(JSON.stringify(result)).not.toContain('insights');
      expect(JSON.stringify(result)).not.toContain('question');
    });

    it('returns null cards for a palm reading (no structural data safe to share)', async () => {
      prisma.shareLink.findFirst.mockResolvedValue({
        ...activeShareLink,
        readingId: 'reading-palm-1',
      });
      prisma.reading.findUnique.mockResolvedValue(completedPalmReading);
      prisma.reading.findUniqueOrThrow.mockResolvedValue(completedPalmReading);

      const result = await service.getPublicSummary('share-1');

      expect(result.readingType).toBe('PALM');
      expect(result.cards).toBeNull();
    });

    it('exposes imageUrl only when the image status is READY', async () => {
      prisma.shareLink.findFirst.mockResolvedValue({
        ...activeShareLink,
        imageStatus: 'READY',
      });
      prisma.reading.findUnique.mockResolvedValue(completedTarotReading);
      prisma.reading.findUniqueOrThrow.mockResolvedValue(completedTarotReading);

      const result = await service.getPublicSummary('share-1');

      expect(result.imageUrl).toBe(
        'https://api.example.com/shared/share-1/image',
      );
    });
  });

  describe('getShareImageBytes', () => {
    it('returns null when the link is revoked or missing', async () => {
      prisma.shareLink.findFirst.mockResolvedValue(null);

      await expect(service.getShareImageBytes('missing')).resolves.toBeNull();
    });

    it('returns null when the image is not READY yet', async () => {
      prisma.shareLink.findFirst.mockResolvedValue(activeShareLink);
      prisma.reading.findUnique.mockResolvedValue(completedTarotReading);

      await expect(service.getShareImageBytes('share-1')).resolves.toBeNull();
    });

    it('downloads and returns the image bytes when READY', async () => {
      prisma.shareLink.findFirst.mockResolvedValue({
        ...activeShareLink,
        imageStatus: 'READY',
        imageKey: 'share-images/reading-1/x.png',
      });
      prisma.reading.findUnique.mockResolvedValue(completedTarotReading);
      storageService.downloadObject.mockResolvedValue(Buffer.from('png-bytes'));

      const result = await service.getShareImageBytes('share-1');

      expect(storageService.downloadObject).toHaveBeenCalledWith(
        'share-images/reading-1/x.png',
      );
      expect(result).toEqual({
        buffer: Buffer.from('png-bytes'),
        contentType: 'image/png',
      });
    });
  });

  describe('logSignupConversion', () => {
    it('does nothing when there is no referral token', async () => {
      await service.logSignupConversion('user-1', null);

      expect(prisma.analyticsEvent.create).not.toHaveBeenCalled();
    });

    it('does nothing when the referral token does not match any share link', async () => {
      prisma.shareLink.findUnique.mockResolvedValue(null);

      await service.logSignupConversion('user-1', 'unknown-token');

      expect(prisma.analyticsEvent.create).not.toHaveBeenCalled();
    });

    it('logs a SHARE_SIGNUP conversion event tied to the share link and the new user', async () => {
      prisma.shareLink.findUnique.mockResolvedValue(activeShareLink);

      await service.logSignupConversion('user-2', 'share-1');

      expect(prisma.analyticsEvent.create).toHaveBeenCalledWith({
        data: {
          type: 'SHARE_SIGNUP',
          shareLinkId: 'share-1',
          userId: 'user-2',
        },
      });
    });
  });
});
