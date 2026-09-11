import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import {
  IMAGE_ANALYSIS_QUEUE,
  READING_PROCESSING_QUEUE,
} from '../queues/queues.module';
import { RewardsService } from '../rewards/rewards.service';
import { SharingService } from '../sharing/sharing.service';
import {
  readImageDimensions,
  sniffImageMimeType,
} from '../storage/image-validation';
import { StorageService } from '../storage/storage.service';
import { DrawEngineService } from '../tarot/draw-engine.service';
import { TarotService } from '../tarot/tarot.service';
import { WalletService } from '../wallet/wallet.service';
import { ReadingAlreadySubmittedError } from '../wallet/wallet.types';
import { ReadingsService } from './readings.service';

jest.mock('../storage/image-validation');
const mockedSniffImageMimeType = sniffImageMimeType as jest.MockedFunction<
  typeof sniffImageMimeType
>;
const mockedReadImageDimensions = readImageDimensions as jest.MockedFunction<
  typeof readImageDimensions
>;

const FORM_SCHEMA = {
  fields: [
    {
      key: 'question',
      label: '¿Qué quieres consultar?',
      required: true,
      minLength: 5,
    },
  ],
};

const baseReading = {
  id: 'reading-1',
  userId: 'user-1',
  serviceId: 'service-1',
  spreadId: 'spread-1',
  status: 'DRAFT' as const,
  submittedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const baseService = {
  id: 'service-1',
  code: 'TAROT_THREE',
  name: 'Tarot de tres cartas',
  description: null,
  creditCost: 10,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const palmService = {
  ...baseService,
  id: 'service-palm-1',
  code: 'PALM_BASIC',
  name: 'Lectura de una palma',
  creditCost: 15,
};

const palmReading = {
  ...baseReading,
  id: 'reading-palm-1',
  serviceId: 'service-palm-1',
  spreadId: null,
};

describe('ReadingsService', () => {
  let service: ReadingsService;
  let prisma: {
    service: {
      findFirst: jest.Mock;
      findUniqueOrThrow: jest.Mock;
    };
    tarotSpread: { findFirst: jest.Mock; findUniqueOrThrow: jest.Mock };
    reading: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    readingInput: { findUnique: jest.Mock; upsert: jest.Mock };
    tarotDraw: { createMany: jest.Mock };
    palmImage: {
      count: jest.Mock;
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let tarotService: { getActiveDeckCards: jest.Mock };
  let drawEngine: { draw: jest.Mock };
  let readingQueue: { add: jest.Mock };
  let imageAnalysisQueue: { add: jest.Mock };
  let storageService: {
    buildPalmImageKey: jest.Mock;
    createPresignedUploadUrl: jest.Mock;
    headObject: jest.Mock;
    downloadObject: jest.Mock;
    deleteObject: jest.Mock;
  };
  let configService: { get: jest.Mock };
  let walletService: { reserveCreditsForReading: jest.Mock };
  let sharingService: { getActiveShareLinkSummary: jest.Mock };
  let rewardsService: { tryConsumeUnlock: jest.Mock };

  beforeEach(async () => {
    prisma = {
      service: { findFirst: jest.fn(), findUniqueOrThrow: jest.fn() },
      tarotSpread: { findFirst: jest.fn(), findUniqueOrThrow: jest.fn() },
      reading: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      readingInput: { findUnique: jest.fn(), upsert: jest.fn() },
      tarotDraw: { createMany: jest.fn() },
      palmImage: {
        count: jest.fn(),
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    tarotService = { getActiveDeckCards: jest.fn() };
    drawEngine = { draw: jest.fn() };
    readingQueue = { add: jest.fn().mockResolvedValue(undefined) };
    imageAnalysisQueue = { add: jest.fn().mockResolvedValue(undefined) };
    walletService = {
      reserveCreditsForReading: jest.fn().mockResolvedValue(undefined),
    };
    sharingService = {
      getActiveShareLinkSummary: jest.fn().mockResolvedValue(null),
    };
    rewardsService = {
      // Por defecto ninguna prueba tiene un desbloqueo por anuncios ya
      // ganado -- se comportan igual que antes de que existiera esta
      // función, cobrando el costo normal en créditos.
      tryConsumeUnlock: jest.fn().mockResolvedValue(false),
    };
    storageService = {
      buildPalmImageKey: jest.fn().mockReturnValue('palm-reading/key.jpg'),
      createPresignedUploadUrl: jest.fn().mockResolvedValue({
        key: 'palm-reading/key.jpg',
        uploadUrl: 'https://storage.local/upload',
        expiresInSeconds: 300,
      }),
      headObject: jest.fn(),
      downloadObject: jest.fn(),
      deleteObject: jest.fn(),
    };
    configService = {
      get: jest.fn(
        (key: string) =>
          ({
            PALM_IMAGE_MAX_SIZE_BYTES: 10 * 1024 * 1024,
            PALM_IMAGE_RETENTION_HOURS: 24,
          })[key],
      ),
    };

    const module = await Test.createTestingModule({
      providers: [
        ReadingsService,
        { provide: PrismaService, useValue: prisma },
        { provide: TarotService, useValue: tarotService },
        { provide: DrawEngineService, useValue: drawEngine },
        { provide: StorageService, useValue: storageService },
        { provide: ConfigService, useValue: configService },
        { provide: WalletService, useValue: walletService },
        { provide: SharingService, useValue: sharingService },
        { provide: RewardsService, useValue: rewardsService },
        {
          provide: getQueueToken(READING_PROCESSING_QUEUE),
          useValue: readingQueue,
        },
        {
          provide: getQueueToken(IMAGE_ANALYSIS_QUEUE),
          useValue: imageAnalysisQueue,
        },
      ],
    }).compile();

    service = module.get(ReadingsService);
  });

  describe('create', () => {
    it('throws NotFoundException when the service does not exist or is inactive', async () => {
      prisma.service.findFirst.mockResolvedValue(null);

      await expect(service.create('user-1', 'UNKNOWN')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('creates a DRAFT reading with the matching spread when one exists', async () => {
      prisma.service.findFirst.mockResolvedValue(baseService);
      prisma.tarotSpread.findFirst.mockResolvedValue({ id: 'spread-1' });
      prisma.reading.create.mockResolvedValue({
        ...baseReading,
        service: baseService,
      });

      const result = await service.create('user-1', 'TAROT_THREE');

      expect(prisma.reading.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          serviceId: 'service-1',
          spreadId: 'spread-1',
        },
        include: { service: true },
      });
      expect(result).toMatchObject({ id: 'reading-1', status: 'DRAFT' });
    });

    it('creates a reading without a spread when the service has none configured', async () => {
      prisma.service.findFirst.mockResolvedValue(baseService);
      prisma.tarotSpread.findFirst.mockResolvedValue(null);
      prisma.reading.create.mockResolvedValue({
        ...baseReading,
        spreadId: null,
        service: baseService,
      });

      await service.create('user-1', 'TAROT_THREE');

      expect(prisma.reading.create).toHaveBeenCalledWith({
        data: { userId: 'user-1', serviceId: 'service-1', spreadId: undefined },
        include: { service: true },
      });
    });
  });

  describe('listForUser', () => {
    it('maps readings to summaries ordered by creation date', async () => {
      prisma.reading.findMany.mockResolvedValue([
        { ...baseReading, service: baseService },
      ]);

      const result = await service.listForUser('user-1');

      expect(result).toEqual([
        {
          id: 'reading-1',
          serviceCode: 'TAROT_THREE',
          status: 'DRAFT',
          createdAt: baseReading.createdAt,
          submittedAt: null,
        },
      ]);
    });
  });

  describe('findOneForUser', () => {
    it('throws NotFoundException when the reading does not belong to the user', async () => {
      prisma.reading.findFirst.mockResolvedValue(null);

      await expect(
        service.findOneForUser('user-1', 'reading-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('orders draws by the spread position order, not by draw creation order', async () => {
      prisma.reading.findFirst.mockResolvedValue({
        ...baseReading,
        service: baseService,
        spread: {
          positions: [
            { code: 'PAST', orderIndex: 0 },
            { code: 'PRESENT', orderIndex: 1 },
            { code: 'TREND', orderIndex: 2 },
          ],
        },
        input: { formVersion: 1, answers: { question: 'x' } },
        draws: [
          {
            position: 'TREND',
            orientation: 'UPRIGHT',
            card: { code: 'C3', name: 'Three', arcana: 'MAJOR', suit: null },
          },
          {
            position: 'PAST',
            orientation: 'REVERSED',
            card: { code: 'C1', name: 'One', arcana: 'MAJOR', suit: null },
          },
        ],
        aiExecutions: [],
        palmImages: [],
      });

      const result = await service.findOneForUser('user-1', 'reading-1');

      expect(result.draws.map((d) => d.position)).toEqual(['PAST', 'TREND']);
    });

    it('exposes the most recent COMPLETED AI execution as aiResult', async () => {
      const output = { title: 'x', summary: 'y' };
      prisma.reading.findFirst.mockResolvedValue({
        ...baseReading,
        service: baseService,
        spread: null,
        input: null,
        draws: [],
        aiExecutions: [{ outputJson: output }],
        palmImages: [],
      });

      const result = await service.findOneForUser('user-1', 'reading-1');

      expect(result.aiResult).toEqual(output);
    });

    it('leaves aiResult null when there is no completed AI execution yet', async () => {
      prisma.reading.findFirst.mockResolvedValue({
        ...baseReading,
        service: baseService,
        spread: null,
        input: null,
        draws: [],
        aiExecutions: [],
        palmImages: [],
      });

      const result = await service.findOneForUser('user-1', 'reading-1');

      expect(result.aiResult).toBeNull();
    });
  });

  describe('updateInputs', () => {
    it('throws NotFoundException when the reading does not belong to the user', async () => {
      prisma.reading.findFirst.mockResolvedValue(null);

      await expect(
        service.updateInputs('user-1', 'reading-1', { question: 'hello' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequestException when the reading is no longer a DRAFT', async () => {
      prisma.reading.findFirst.mockResolvedValue({
        ...baseReading,
        status: 'PENDING',
      });

      await expect(
        service.updateInputs('user-1', 'reading-1', { question: 'hello' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException when the service has no active form', async () => {
      prisma.reading.findFirst
        .mockResolvedValueOnce(baseReading) // findOwnedDraft
        .mockResolvedValueOnce({
          ...baseReading,
          service: baseService,
          spread: null,
          input: null,
          draws: [],
          aiExecutions: [],
          palmImages: [],
        }); // findOneForUser (unreachable if it throws first)
      prisma.service.findUniqueOrThrow.mockResolvedValue({
        ...baseService,
        forms: [],
      });

      await expect(
        service.updateInputs('user-1', 'reading-1', { question: 'hello' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('validates the answers against the active form and persists them', async () => {
      prisma.reading.findFirst
        .mockResolvedValueOnce(baseReading)
        .mockResolvedValueOnce({
          ...baseReading,
          service: baseService,
          spread: null,
          input: { formVersion: 1, answers: { question: 'A valid question' } },
          draws: [],
          aiExecutions: [],
          palmImages: [],
        });
      prisma.service.findUniqueOrThrow.mockResolvedValue({
        ...baseService,
        forms: [{ version: 1, schema: FORM_SCHEMA }],
      });

      await service.updateInputs('user-1', 'reading-1', {
        question: 'A valid question',
      });

      expect(prisma.readingInput.upsert).toHaveBeenCalledWith({
        where: { readingId: 'reading-1' },
        update: {
          formVersion: 1,
          answers: { question: 'A valid question' },
        },
        create: {
          readingId: 'reading-1',
          formVersion: 1,
          answers: { question: 'A valid question' },
        },
      });
    });

    it('rejects answers that fail form validation before touching the database', async () => {
      prisma.reading.findFirst.mockResolvedValueOnce(baseReading);
      prisma.service.findUniqueOrThrow.mockResolvedValue({
        ...baseService,
        forms: [{ version: 1, schema: FORM_SCHEMA }],
      });

      await expect(
        service.updateInputs('user-1', 'reading-1', { question: 'hi' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.readingInput.upsert).not.toHaveBeenCalled();
    });
  });

  describe('presignImage', () => {
    it('throws BadRequestException when the service does not accept images', async () => {
      prisma.reading.findFirst.mockResolvedValueOnce(baseReading);
      prisma.service.findUniqueOrThrow.mockResolvedValue(baseService);

      await expect(
        service.presignImage('user-1', 'reading-1', 'image/jpeg'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException when the image slots are already used', async () => {
      prisma.reading.findFirst.mockResolvedValueOnce(palmReading);
      prisma.service.findUniqueOrThrow.mockResolvedValue(palmService);
      prisma.palmImage.count.mockResolvedValue(1);

      await expect(
        service.presignImage('user-1', 'reading-palm-1', 'image/jpeg'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates a PalmImage row and returns a presigned upload URL', async () => {
      prisma.reading.findFirst.mockResolvedValueOnce(palmReading);
      prisma.service.findUniqueOrThrow.mockResolvedValue(palmService);
      prisma.palmImage.count.mockResolvedValue(0);

      const result = await service.presignImage(
        'user-1',
        'reading-palm-1',
        'image/jpeg',
      );

      expect(storageService.buildPalmImageKey).toHaveBeenCalledWith(
        'user-1',
        'reading-palm-1',
        'image/jpeg',
      );
      expect(prisma.palmImage.create).toHaveBeenCalledWith({
        data: {
          readingId: 'reading-palm-1',
          storageKey: 'palm-reading/key.jpg',
          status: 'UPLOADED',
        },
      });
      expect(result.uploadUrl).toBe('https://storage.local/upload');
    });
  });

  describe('confirmImage', () => {
    const uploadedImage = {
      id: 'image-1',
      readingId: 'reading-palm-1',
      storageKey: 'palm-reading/key.jpg',
      status: 'UPLOADED' as const,
      validationError: null,
    };

    beforeEach(() => {
      prisma.reading.findFirst.mockResolvedValueOnce(palmReading);
      prisma.palmImage.findFirst.mockResolvedValue(uploadedImage);
      mockedSniffImageMimeType.mockReset();
      mockedReadImageDimensions.mockReset();
    });

    it('marks the image INVALID when the object was never uploaded', async () => {
      storageService.headObject.mockResolvedValue(null);
      prisma.palmImage.update.mockImplementation(({ data }) => ({
        ...uploadedImage,
        ...data,
      }));

      const result = await service.confirmImage(
        'user-1',
        'reading-palm-1',
        'palm-reading/key.jpg',
      );

      expect(result.status).toBe('INVALID');
      expect(storageService.downloadObject).not.toHaveBeenCalled();
    });

    it('marks the image INVALID when it exceeds the max size', async () => {
      storageService.headObject.mockResolvedValue({
        sizeBytes: 999 * 1024 * 1024,
      });
      prisma.palmImage.update.mockImplementation(({ data }) => ({
        ...uploadedImage,
        ...data,
      }));

      const result = await service.confirmImage(
        'user-1',
        'reading-palm-1',
        'palm-reading/key.jpg',
      );

      expect(result.status).toBe('INVALID');
      expect(storageService.downloadObject).not.toHaveBeenCalled();
    });

    it('marks the image INVALID when the real bytes are not a supported image format', async () => {
      storageService.headObject.mockResolvedValue({ sizeBytes: 1024 });
      storageService.downloadObject.mockResolvedValue(
        Buffer.from('not-an-image'),
      );
      mockedSniffImageMimeType.mockReturnValue(null);
      prisma.palmImage.update.mockImplementation(({ data }) => ({
        ...uploadedImage,
        ...data,
      }));

      const result = await service.confirmImage(
        'user-1',
        'reading-palm-1',
        'palm-reading/key.jpg',
      );

      expect(result.status).toBe('INVALID');
      expect(result.validationError).toMatch(/JPEG, PNG o WebP/);
    });

    it('marks the image INVALID when it is too small', async () => {
      storageService.headObject.mockResolvedValue({ sizeBytes: 1024 });
      storageService.downloadObject.mockResolvedValue(Buffer.from('img'));
      mockedSniffImageMimeType.mockReturnValue('image/jpeg');
      mockedReadImageDimensions.mockReturnValue({
        widthPx: 50,
        heightPx: 50,
      });
      prisma.palmImage.update.mockImplementation(({ data }) => ({
        ...uploadedImage,
        ...data,
      }));

      const result = await service.confirmImage(
        'user-1',
        'reading-palm-1',
        'palm-reading/key.jpg',
      );

      expect(result.status).toBe('INVALID');
      expect(result.validationError).toMatch(/pequeña/);
    });

    it('marks the image PENDING_REVIEW when technical validation passes', async () => {
      storageService.headObject.mockResolvedValue({ sizeBytes: 2048 });
      storageService.downloadObject.mockResolvedValue(Buffer.from('img'));
      mockedSniffImageMimeType.mockReturnValue('image/jpeg');
      mockedReadImageDimensions.mockReturnValue({
        widthPx: 800,
        heightPx: 600,
      });
      prisma.palmImage.update.mockImplementation(({ data }) => ({
        ...uploadedImage,
        ...data,
      }));

      const result = await service.confirmImage(
        'user-1',
        'reading-palm-1',
        'palm-reading/key.jpg',
      );

      expect(result.status).toBe('PENDING_REVIEW');
      expect(prisma.palmImage.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'PENDING_REVIEW',
            mimeType: 'image/jpeg',
          }),
        }),
      );
      expect(imageAnalysisQueue.add).toHaveBeenCalledWith(
        'VALIDATE_PALM_IMAGE',
        { palmImageId: 'image-1' },
        { jobId: 'VALIDATE_PALM_IMAGE-image-1' },
      );
    });

    it('does not enqueue a validation job when technical validation fails', async () => {
      storageService.headObject.mockResolvedValue(null);
      prisma.palmImage.update.mockImplementation(({ data }) => ({
        ...uploadedImage,
        ...data,
      }));

      await service.confirmImage(
        'user-1',
        'reading-palm-1',
        'palm-reading/key.jpg',
      );

      expect(imageAnalysisQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('submit (palm reading)', () => {
    it('throws BadRequestException when not enough images are VALID yet', async () => {
      prisma.reading.findFirst.mockResolvedValueOnce(palmReading);
      prisma.service.findUniqueOrThrow.mockResolvedValue(palmService);
      prisma.palmImage.count.mockResolvedValue(0);

      await expect(
        service.submit('user-1', 'reading-palm-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(readingQueue.add).not.toHaveBeenCalled();
    });

    it('moves the reading to PENDING and enqueues PROCESS_PALM once images are VALID', async () => {
      prisma.reading.findFirst
        .mockResolvedValueOnce(palmReading)
        .mockResolvedValueOnce({
          ...palmReading,
          status: 'PENDING',
          service: palmService,
          spread: null,
          input: null,
          draws: [],
          aiExecutions: [],
          palmImages: [],
        });
      prisma.service.findUniqueOrThrow.mockResolvedValue(palmService);
      prisma.palmImage.count.mockResolvedValue(1);

      await service.submit('user-1', 'reading-palm-1');

      expect(walletService.reserveCreditsForReading).toHaveBeenCalledWith(
        prisma,
        'user-1',
        'reading-palm-1',
        palmService.creditCost,
      );
      expect(prisma.reading.update).toHaveBeenCalledWith({
        where: { id: 'reading-palm-1' },
        data: { status: 'PENDING', submittedAt: expect.any(Date) },
      });
      expect(readingQueue.add).toHaveBeenCalledWith(
        'PROCESS_PALM',
        { readingId: 'reading-palm-1' },
        { jobId: 'PROCESS_PALM-reading-palm-1' },
      );
    });

    it('throws BadRequestException without enqueuing a job when credits could not be reserved', async () => {
      prisma.reading.findFirst.mockResolvedValueOnce(palmReading);
      prisma.service.findUniqueOrThrow.mockResolvedValue(palmService);
      prisma.palmImage.count.mockResolvedValue(1);
      walletService.reserveCreditsForReading.mockRejectedValue(
        new BadRequestException('Saldo insuficiente para enviar esta lectura.'),
      );

      await expect(
        service.submit('user-1', 'reading-palm-1'),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(readingQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('submit', () => {
    it('throws BadRequestException when there are no saved inputs yet', async () => {
      prisma.reading.findFirst.mockResolvedValueOnce(baseReading);
      prisma.service.findUniqueOrThrow.mockResolvedValue(baseService);
      prisma.readingInput.findUnique.mockResolvedValue(null);

      await expect(
        service.submit('user-1', 'reading-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException when the reading has no spread configured', async () => {
      prisma.reading.findFirst.mockResolvedValueOnce({
        ...baseReading,
        spreadId: null,
      });
      prisma.service.findUniqueOrThrow.mockResolvedValue(baseService);
      prisma.readingInput.findUnique.mockResolvedValue({
        readingId: 'reading-1',
      });

      await expect(
        service.submit('user-1', 'reading-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('draws the cards, persists them and moves the reading to PENDING', async () => {
      prisma.service.findUniqueOrThrow.mockResolvedValue(baseService);
      prisma.reading.findFirst
        .mockResolvedValueOnce(baseReading) // findOwnedDraft
        .mockResolvedValueOnce({
          ...baseReading,
          status: 'PENDING',
          service: baseService,
          spread: { positions: [] },
          input: { formVersion: 1, answers: {} },
          draws: [],
          aiExecutions: [],
          palmImages: [],
        }); // final findOneForUser
      prisma.readingInput.findUnique.mockResolvedValue({
        readingId: 'reading-1',
      });
      prisma.tarotSpread.findUniqueOrThrow.mockResolvedValue({
        id: 'spread-1',
        positions: [
          { code: 'PAST', orderIndex: 0 },
          { code: 'PRESENT', orderIndex: 1 },
          { code: 'TREND', orderIndex: 2 },
        ],
      });
      const deck = [{ id: 'card-1', code: 'THE_FOOL' }];
      tarotService.getActiveDeckCards.mockResolvedValue(deck);
      drawEngine.draw.mockReturnValue([
        { position: 'PAST', card: { id: 'card-1' }, orientation: 'UPRIGHT' },
        {
          position: 'PRESENT',
          card: { id: 'card-2' },
          orientation: 'REVERSED',
        },
        { position: 'TREND', card: { id: 'card-3' }, orientation: 'UPRIGHT' },
      ]);

      await service.submit('user-1', 'reading-1');

      expect(drawEngine.draw).toHaveBeenCalledWith(deck, [
        'PAST',
        'PRESENT',
        'TREND',
      ]);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(walletService.reserveCreditsForReading).toHaveBeenCalledWith(
        prisma,
        'user-1',
        'reading-1',
        baseService.creditCost,
      );
      expect(prisma.tarotDraw.createMany).toHaveBeenCalledTimes(1);

      expect(readingQueue.add).toHaveBeenCalledWith(
        'PROCESS_TAROT',
        { readingId: 'reading-1' },
        { jobId: 'PROCESS_TAROT-reading-1' },
      );
      expect(rewardsService.tryConsumeUnlock).toHaveBeenCalledWith(
        'user-1',
        'TAROT_READING_UNLOCK',
        prisma,
      );
    });

    it('charges zero credits when the ad-based unlock was already earned, instead of the configured price', async () => {
      rewardsService.tryConsumeUnlock.mockResolvedValue(true);
      prisma.service.findUniqueOrThrow.mockResolvedValue(baseService);
      prisma.reading.findFirst
        .mockResolvedValueOnce(baseReading)
        .mockResolvedValueOnce({
          ...baseReading,
          status: 'PENDING',
          service: baseService,
          spread: { positions: [] },
          input: { formVersion: 1, answers: {} },
          draws: [],
          aiExecutions: [],
          palmImages: [],
        });
      prisma.readingInput.findUnique.mockResolvedValue({
        readingId: 'reading-1',
      });
      prisma.tarotSpread.findUniqueOrThrow.mockResolvedValue({
        id: 'spread-1',
        positions: [{ code: 'PAST', orderIndex: 0 }],
      });
      tarotService.getActiveDeckCards.mockResolvedValue([
        { id: 'card-1', code: 'THE_FOOL' },
      ]);
      drawEngine.draw.mockReturnValue([
        { position: 'PAST', card: { id: 'card-1' }, orientation: 'UPRIGHT' },
      ]);

      await service.submit('user-1', 'reading-1');

      expect(walletService.reserveCreditsForReading).toHaveBeenCalledWith(
        prisma,
        'user-1',
        'reading-1',
        0,
      );
    });

    it('does not check or consume the ad-based unlock for a deeper spread than the base tier', async () => {
      const fiveCardService = { ...baseService, code: 'TAROT_FIVE', creditCost: 18 };
      prisma.service.findUniqueOrThrow.mockResolvedValue(fiveCardService);
      prisma.reading.findFirst
        .mockResolvedValueOnce({ ...baseReading, serviceId: 'service-five' })
        .mockResolvedValueOnce({
          ...baseReading,
          status: 'PENDING',
          service: fiveCardService,
          spread: { positions: [] },
          input: { formVersion: 1, answers: {} },
          draws: [],
          aiExecutions: [],
          palmImages: [],
        });
      prisma.readingInput.findUnique.mockResolvedValue({
        readingId: 'reading-1',
      });
      prisma.tarotSpread.findUniqueOrThrow.mockResolvedValue({
        id: 'spread-1',
        positions: [{ code: 'PAST', orderIndex: 0 }],
      });
      tarotService.getActiveDeckCards.mockResolvedValue([
        { id: 'card-1', code: 'THE_FOOL' },
      ]);
      drawEngine.draw.mockReturnValue([
        { position: 'PAST', card: { id: 'card-1' }, orientation: 'UPRIGHT' },
      ]);

      await service.submit('user-1', 'reading-1');

      expect(rewardsService.tryConsumeUnlock).not.toHaveBeenCalled();
      expect(walletService.reserveCreditsForReading).toHaveBeenCalledWith(
        prisma,
        'user-1',
        'reading-1',
        18,
      );
    });

    it('throws BadRequestException without enqueuing a job when credits could not be reserved', async () => {
      prisma.service.findUniqueOrThrow.mockResolvedValue(baseService);
      prisma.reading.findFirst.mockResolvedValueOnce(baseReading);
      prisma.readingInput.findUnique.mockResolvedValue({
        readingId: 'reading-1',
      });
      prisma.tarotSpread.findUniqueOrThrow.mockResolvedValue({
        id: 'spread-1',
        positions: [{ code: 'PAST', orderIndex: 0 }],
      });
      tarotService.getActiveDeckCards.mockResolvedValue([
        { id: 'card-1', code: 'THE_FOOL' },
      ]);
      drawEngine.draw.mockReturnValue([
        { position: 'PAST', card: { id: 'card-1' }, orientation: 'UPRIGHT' },
      ]);
      walletService.reserveCreditsForReading.mockRejectedValue(
        new BadRequestException('Saldo insuficiente para enviar esta lectura.'),
      );

      await expect(
        service.submit('user-1', 'reading-1'),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.tarotDraw.createMany).not.toHaveBeenCalled();
      expect(readingQueue.add).not.toHaveBeenCalled();
    });

    it('returns the current reading state instead of duplicating draws when another concurrent submit already reserved credits', async () => {
      prisma.service.findUniqueOrThrow.mockResolvedValue(baseService);
      prisma.reading.findFirst
        .mockResolvedValueOnce(baseReading) // findOwnedDraft
        .mockResolvedValueOnce({
          ...baseReading,
          status: 'PENDING',
          service: baseService,
          spread: { positions: [] },
          input: { formVersion: 1, answers: {} },
          draws: [],
          aiExecutions: [],
          palmImages: [],
        }); // findOneForUser after the graceful fallback
      prisma.readingInput.findUnique.mockResolvedValue({
        readingId: 'reading-1',
      });
      prisma.tarotSpread.findUniqueOrThrow.mockResolvedValue({
        id: 'spread-1',
        positions: [{ code: 'PAST', orderIndex: 0 }],
      });
      tarotService.getActiveDeckCards.mockResolvedValue([
        { id: 'card-1', code: 'THE_FOOL' },
      ]);
      drawEngine.draw.mockReturnValue([
        { position: 'PAST', card: { id: 'card-1' }, orientation: 'UPRIGHT' },
      ]);
      walletService.reserveCreditsForReading.mockRejectedValue(
        new ReadingAlreadySubmittedError(),
      );

      const result = await service.submit('user-1', 'reading-1');

      expect(result.status).toBe('PENDING');
      expect(readingQueue.add).not.toHaveBeenCalled();
    });

    it('enqueues the job only after the draws transaction succeeds', async () => {
      prisma.service.findUniqueOrThrow.mockResolvedValue(baseService);
      prisma.reading.findFirst
        .mockResolvedValueOnce(baseReading)
        .mockResolvedValueOnce({
          ...baseReading,
          status: 'PENDING',
          service: baseService,
          spread: { positions: [] },
          input: { formVersion: 1, answers: {} },
          draws: [],
          aiExecutions: [],
          palmImages: [],
        });
      prisma.readingInput.findUnique.mockResolvedValue({
        readingId: 'reading-1',
      });
      prisma.tarotSpread.findUniqueOrThrow.mockResolvedValue({
        id: 'spread-1',
        positions: [{ code: 'PAST', orderIndex: 0 }],
      });
      tarotService.getActiveDeckCards.mockResolvedValue([
        { id: 'card-1', code: 'THE_FOOL' },
      ]);
      drawEngine.draw.mockReturnValue([
        { position: 'PAST', card: { id: 'card-1' }, orientation: 'UPRIGHT' },
      ]);
      prisma.$transaction.mockRejectedValueOnce(new Error('db down'));

      await expect(service.submit('user-1', 'reading-1')).rejects.toThrow(
        'db down',
      );

      expect(readingQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('retry', () => {
    it('throws NotFoundException when the reading does not exist or is not owned by the user', async () => {
      prisma.reading.findFirst.mockResolvedValueOnce(null);

      await expect(service.retry('user-1', 'reading-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.reading.update).not.toHaveBeenCalled();
      expect(readingQueue.add).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the reading is not FAILED, and never touches the wallet or the queue', async () => {
      prisma.reading.findFirst.mockResolvedValueOnce({
        ...baseReading,
        status: 'COMPLETED',
        service: baseService,
      });

      await expect(service.retry('user-1', 'reading-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.reading.update).not.toHaveBeenCalled();
      expect(readingQueue.add).not.toHaveBeenCalled();
    });

    it('resets a FAILED tarot reading to PENDING and re-enqueues with a fresh retry job id, never recharging credits', async () => {
      prisma.reading.findFirst
        .mockResolvedValueOnce({
          ...baseReading,
          status: 'FAILED',
          service: baseService,
        }) // ownership + status check
        .mockResolvedValueOnce({
          ...baseReading,
          status: 'PENDING',
          service: baseService,
          spread: { positions: [] },
          input: { formVersion: 1, answers: {} },
          draws: [],
          aiExecutions: [],
          palmImages: [],
        }); // final findOneForUser

      await service.retry('user-1', 'reading-1');

      expect(prisma.reading.update).toHaveBeenCalledWith({
        where: { id: 'reading-1' },
        data: { status: 'PENDING' },
      });
      expect(readingQueue.add).toHaveBeenCalledWith(
        'PROCESS_TAROT',
        { readingId: 'reading-1' },
        { jobId: expect.stringContaining('PROCESS_TAROT-reading-1-retry-') },
      );
      expect(walletService.reserveCreditsForReading).not.toHaveBeenCalled();
    });

    it('re-enqueues PROCESS_PALM for a FAILED palm reading', async () => {
      prisma.reading.findFirst
        .mockResolvedValueOnce({
          ...palmReading,
          status: 'FAILED',
          service: palmService,
        })
        .mockResolvedValueOnce({
          ...palmReading,
          status: 'PENDING',
          service: palmService,
          spread: null,
          input: null,
          draws: [],
          aiExecutions: [],
          palmImages: [],
        });

      await service.retry('user-1', 'reading-palm-1');

      expect(readingQueue.add).toHaveBeenCalledWith(
        'PROCESS_PALM',
        { readingId: 'reading-palm-1' },
        {
          jobId: expect.stringContaining('PROCESS_PALM-reading-palm-1-retry-'),
        },
      );
    });
  });

  describe('retryAsAdmin', () => {
    it('throws NotFoundException when the reading does not exist', async () => {
      prisma.reading.findUnique.mockResolvedValueOnce(null);

      await expect(service.retryAsAdmin('reading-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(readingQueue.add).not.toHaveBeenCalled();
    });

    it('resets and re-enqueues a FAILED reading regardless of who owns it', async () => {
      prisma.reading.findUnique.mockResolvedValueOnce({
        ...baseReading,
        status: 'FAILED',
        service: baseService,
      });
      prisma.reading.findFirst.mockResolvedValueOnce({
        ...baseReading,
        status: 'PENDING',
        service: baseService,
        spread: { positions: [] },
        input: { formVersion: 1, answers: {} },
        draws: [],
        aiExecutions: [],
        palmImages: [],
      });

      await service.retryAsAdmin('reading-1');

      expect(prisma.reading.update).toHaveBeenCalledWith({
        where: { id: 'reading-1' },
        data: { status: 'PENDING' },
      });
      expect(readingQueue.add).toHaveBeenCalledWith(
        'PROCESS_TAROT',
        { readingId: 'reading-1' },
        { jobId: expect.stringContaining('PROCESS_TAROT-reading-1-retry-') },
      );
    });
  });

  describe('remove', () => {
    it('throws BadRequestException when the reading is no longer a DRAFT', async () => {
      prisma.reading.findFirst.mockResolvedValue({
        ...baseReading,
        status: 'COMPLETED',
      });

      await expect(
        service.remove('user-1', 'reading-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.reading.delete).not.toHaveBeenCalled();
    });

    it('deletes the reading when it is still a DRAFT owned by the user', async () => {
      prisma.reading.findFirst.mockResolvedValue(baseReading);
      prisma.palmImage.findMany.mockResolvedValue([]);

      await service.remove('user-1', 'reading-1');

      expect(prisma.reading.delete).toHaveBeenCalledWith({
        where: { id: 'reading-1' },
      });
    });

    it('deletes any uploaded storage objects before deleting the reading, so cascading the DB row never orphans a file in the bucket', async () => {
      prisma.reading.findFirst.mockResolvedValue(baseReading);
      prisma.palmImage.findMany.mockResolvedValue([
        { id: 'image-1', storageKey: 'palm-reading/a.jpg' },
        { id: 'image-2', storageKey: 'palm-reading/b.jpg' },
      ]);

      await service.remove('user-1', 'reading-1');

      expect(storageService.deleteObject).toHaveBeenCalledWith(
        'palm-reading/a.jpg',
      );
      expect(storageService.deleteObject).toHaveBeenCalledWith(
        'palm-reading/b.jpg',
      );
      expect(prisma.reading.delete).toHaveBeenCalledWith({
        where: { id: 'reading-1' },
      });
    });
  });
});
