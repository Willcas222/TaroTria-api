import { Test } from '@nestjs/testing';
import { AiOrchestratorService } from '../../ai/ai-orchestrator.service';
import { PromptsService } from '../../ai/prompts.service';
import { PALM_IMAGE_LEGIBILITY_TASK } from '../../ai/tasks/palm-legibility.schema';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { PalmImageValidationProcessor } from './palm-image-validation.processor';

const pendingImage = {
  id: 'image-1',
  readingId: 'reading-1',
  storageKey: 'palm-reading/user-1/reading-1/abc.jpg',
  status: 'PENDING_REVIEW' as const,
  mimeType: 'image/jpeg',
};

describe('PalmImageValidationProcessor', () => {
  let processor: PalmImageValidationProcessor;
  let prisma: {
    palmImage: {
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let storageService: { downloadObject: jest.Mock };
  let promptsService: { getPublishedVersionId: jest.Mock };
  let aiOrchestrator: { execute: jest.Mock };

  beforeEach(async () => {
    prisma = {
      palmImage: {
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    storageService = { downloadObject: jest.fn() };
    promptsService = {
      getPublishedVersionId: jest.fn().mockResolvedValue('version-1'),
    };
    aiOrchestrator = { execute: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        PalmImageValidationProcessor,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: storageService },
        { provide: PromptsService, useValue: promptsService },
        { provide: AiOrchestratorService, useValue: aiOrchestrator },
      ],
    }).compile();

    processor = module.get(PalmImageValidationProcessor);
  });

  describe('validateImage', () => {
    it('does nothing when the image no longer exists', async () => {
      prisma.palmImage.findUnique.mockResolvedValue(null);

      await processor.validateImage('missing');

      expect(storageService.downloadObject).not.toHaveBeenCalled();
      expect(prisma.palmImage.update).not.toHaveBeenCalled();
    });

    it('is idempotent: skips images that are no longer PENDING_REVIEW', async () => {
      prisma.palmImage.findUnique.mockResolvedValue({
        ...pendingImage,
        status: 'VALID',
      });

      await processor.validateImage('image-1');

      expect(storageService.downloadObject).not.toHaveBeenCalled();
      expect(prisma.palmImage.update).not.toHaveBeenCalled();
    });

    it('marks the image VALID when the AI check confirms a legible palm', async () => {
      prisma.palmImage.findUnique.mockResolvedValue(pendingImage);
      storageService.downloadObject.mockResolvedValue(
        Buffer.from('fake-bytes'),
      );
      aiOrchestrator.execute.mockResolvedValue({
        aiExecutionId: 'exec-1',
        status: 'COMPLETED',
        output: { isLegiblePalm: true, reason: 'Palma clara y bien enfocada.' },
      });

      await processor.validateImage('image-1');

      expect(promptsService.getPublishedVersionId).toHaveBeenCalledWith(
        PALM_IMAGE_LEGIBILITY_TASK,
      );
      expect(aiOrchestrator.execute).toHaveBeenCalledWith({
        promptVersionId: 'version-1',
        readingId: 'reading-1',
        variables: {},
        riskCheckText: '',
        images: [
          {
            base64: Buffer.from('fake-bytes').toString('base64'),
            mimeType: 'image/jpeg',
          },
        ],
      });
      expect(prisma.palmImage.update).toHaveBeenCalledWith({
        where: { id: 'image-1' },
        data: { status: 'VALID', validationError: null },
      });
    });

    it('marks the image INVALID with the reported reason when the AI check rejects the image', async () => {
      prisma.palmImage.findUnique.mockResolvedValue(pendingImage);
      storageService.downloadObject.mockResolvedValue(
        Buffer.from('fake-bytes'),
      );
      aiOrchestrator.execute.mockResolvedValue({
        aiExecutionId: 'exec-1',
        status: 'COMPLETED',
        output: { isLegiblePalm: false, reason: 'La imagen está borrosa.' },
      });

      await processor.validateImage('image-1');

      expect(prisma.palmImage.update).toHaveBeenCalledWith({
        where: { id: 'image-1' },
        data: { status: 'INVALID', validationError: 'La imagen está borrosa.' },
      });
    });

    it('marks the image INVALID when the orchestrator reports a terminal failure', async () => {
      prisma.palmImage.findUnique.mockResolvedValue(pendingImage);
      storageService.downloadObject.mockResolvedValue(
        Buffer.from('fake-bytes'),
      );
      aiOrchestrator.execute.mockResolvedValue({
        aiExecutionId: 'exec-1',
        status: 'FAILED',
        errorMessage:
          'No fue posible generar la interpretación en este momento.',
      });

      await processor.validateImage('image-1');

      expect(prisma.palmImage.update).toHaveBeenCalledWith({
        where: { id: 'image-1' },
        data: {
          status: 'INVALID',
          validationError:
            'No fue posible generar la interpretación en este momento.',
        },
      });
    });
  });

  describe('process (BullMQ job entrypoint)', () => {
    it('delegates to validateImage with the job data', async () => {
      const spy = jest
        .spyOn(processor, 'validateImage')
        .mockResolvedValue(undefined);

      await processor.process({
        data: { palmImageId: 'image-42' },
      } as never);

      expect(spy).toHaveBeenCalledWith('image-42');
    });
  });

  describe('onFailed', () => {
    it('does nothing while attempts remain', async () => {
      await processor.onFailed({
        data: { palmImageId: 'image-1' },
        attemptsMade: 1,
        opts: { attempts: 3 },
      } as never);

      expect(prisma.palmImage.updateMany).not.toHaveBeenCalled();
    });

    it('marks the image INVALID once every attempt is exhausted', async () => {
      await processor.onFailed({
        data: { palmImageId: 'image-1' },
        attemptsMade: 3,
        opts: { attempts: 3 },
      } as never);

      expect(prisma.palmImage.updateMany).toHaveBeenCalledWith({
        where: { id: 'image-1', status: { not: 'VALID' } },
        data: {
          status: 'INVALID',
          validationError: 'No fue posible validar la imagen.',
        },
      });
    });
  });
});
