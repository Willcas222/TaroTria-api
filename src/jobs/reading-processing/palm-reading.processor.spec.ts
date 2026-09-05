import { Test } from '@nestjs/testing';
import { AiOrchestratorService } from '../../ai/ai-orchestrator.service';
import { PromptsService } from '../../ai/prompts.service';
import { PALM_READING_INTERPRETATION_TASK } from '../../ai/tasks/palm-reading-interpretation.schema';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { WalletService } from '../../wallet/wallet.service';
import { PalmReadingProcessor } from './palm-reading.processor';

const baseReading = {
  id: 'reading-1',
  status: 'PENDING' as const,
  palmImages: [
    {
      id: 'image-1',
      storageKey: 'palm-reading/user-1/reading-1/a.jpg',
      mimeType: 'image/jpeg',
    },
    {
      id: 'image-2',
      storageKey: 'palm-reading/user-1/reading-1/b.png',
      mimeType: 'image/png',
    },
  ],
};

describe('PalmReadingProcessor', () => {
  let processor: PalmReadingProcessor;
  let prisma: { reading: { findUnique: jest.Mock; update: jest.Mock } };
  let storageService: { downloadObject: jest.Mock };
  let promptsService: { getPublishedVersionId: jest.Mock };
  let aiOrchestrator: { execute: jest.Mock };
  let walletService: {
    confirmConsumption: jest.Mock;
    releaseReservation: jest.Mock;
  };

  beforeEach(async () => {
    prisma = { reading: { findUnique: jest.fn(), update: jest.fn() } };
    storageService = { downloadObject: jest.fn() };
    promptsService = {
      getPublishedVersionId: jest.fn().mockResolvedValue('version-1'),
    };
    aiOrchestrator = { execute: jest.fn() };
    walletService = {
      confirmConsumption: jest.fn().mockResolvedValue(undefined),
      releaseReservation: jest.fn().mockResolvedValue(undefined),
    };

    const module = await Test.createTestingModule({
      providers: [
        PalmReadingProcessor,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: storageService },
        { provide: PromptsService, useValue: promptsService },
        { provide: AiOrchestratorService, useValue: aiOrchestrator },
        { provide: WalletService, useValue: walletService },
      ],
    }).compile();

    processor = module.get(PalmReadingProcessor);
  });

  describe('processReading', () => {
    it('does nothing when the reading no longer exists', async () => {
      prisma.reading.findUnique.mockResolvedValue(null);

      await processor.processReading('missing');

      expect(promptsService.getPublishedVersionId).not.toHaveBeenCalled();
      expect(prisma.reading.update).not.toHaveBeenCalled();
    });

    it('is idempotent: never reprocesses a reading that is already COMPLETED', async () => {
      prisma.reading.findUnique.mockResolvedValue({
        ...baseReading,
        status: 'COMPLETED',
      });

      await processor.processReading('reading-1');

      expect(aiOrchestrator.execute).not.toHaveBeenCalled();
      expect(prisma.reading.update).not.toHaveBeenCalled();
    });

    it('marks the reading PROCESSING, downloads every VALID image as base64, and completes on success', async () => {
      prisma.reading.findUnique.mockResolvedValue(baseReading);
      storageService.downloadObject
        .mockResolvedValueOnce(Buffer.from('image-a-bytes'))
        .mockResolvedValueOnce(Buffer.from('image-b-bytes'));
      aiOrchestrator.execute.mockResolvedValue({
        aiExecutionId: 'exec-1',
        status: 'COMPLETED',
        output: { title: 'x' },
      });

      await processor.processReading('reading-1');

      expect(promptsService.getPublishedVersionId).toHaveBeenCalledWith(
        PALM_READING_INTERPRETATION_TASK,
      );

      expect(prisma.reading.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'reading-1' },
        data: { status: 'PROCESSING' },
      });

      expect(storageService.downloadObject).toHaveBeenNthCalledWith(
        1,
        'palm-reading/user-1/reading-1/a.jpg',
      );
      expect(storageService.downloadObject).toHaveBeenNthCalledWith(
        2,
        'palm-reading/user-1/reading-1/b.png',
      );

      expect(aiOrchestrator.execute).toHaveBeenCalledWith({
        promptVersionId: 'version-1',
        readingId: 'reading-1',
        variables: {},
        riskCheckText: '',
        images: [
          {
            base64: Buffer.from('image-a-bytes').toString('base64'),
            mimeType: 'image/jpeg',
          },
          {
            base64: Buffer.from('image-b-bytes').toString('base64'),
            mimeType: 'image/png',
          },
        ],
      });

      expect(prisma.reading.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'reading-1' },
        data: { status: 'COMPLETED', promptVersionId: 'version-1' },
      });
      expect(walletService.confirmConsumption).toHaveBeenCalledWith(
        'reading-1',
      );
      expect(walletService.releaseReservation).not.toHaveBeenCalled();
    });

    it('marks the reading FAILED and releases the credit reservation when the orchestrator reports a terminal failure', async () => {
      prisma.reading.findUnique.mockResolvedValue(baseReading);
      storageService.downloadObject.mockResolvedValue(Buffer.from('bytes'));
      aiOrchestrator.execute.mockResolvedValue({
        aiExecutionId: 'exec-1',
        status: 'FAILED',
        errorMessage: 'No fue posible generar la interpretación.',
      });

      await processor.processReading('reading-1');

      expect(prisma.reading.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'reading-1' },
        data: { status: 'FAILED', promptVersionId: 'version-1' },
      });
      expect(walletService.releaseReservation).toHaveBeenCalledWith(
        'reading-1',
      );
      expect(walletService.confirmConsumption).not.toHaveBeenCalled();
    });
  });
});
