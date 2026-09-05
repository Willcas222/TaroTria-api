import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { CLEANUP_QUEUE } from '../../queues/queues.module';
import { StorageService } from '../../storage/storage.service';
import {
  DELETE_EXPIRED_IMAGES_JOB,
  DELETE_EXPIRED_IMAGES_SCHEDULE_ID,
} from './cleanup.types';
import { ImageCleanupProcessor } from './image-cleanup.processor';

describe('ImageCleanupProcessor', () => {
  let processor: ImageCleanupProcessor;
  let prisma: { palmImage: { findMany: jest.Mock; update: jest.Mock } };
  let storageService: { deleteObject: jest.Mock };
  let cleanupQueue: { upsertJobScheduler: jest.Mock };

  beforeEach(async () => {
    prisma = { palmImage: { findMany: jest.fn(), update: jest.fn() } };
    storageService = { deleteObject: jest.fn() };
    cleanupQueue = { upsertJobScheduler: jest.fn().mockResolvedValue({}) };

    const module = await Test.createTestingModule({
      providers: [
        ImageCleanupProcessor,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: storageService },
        { provide: getQueueToken(CLEANUP_QUEUE), useValue: cleanupQueue },
      ],
    }).compile();

    processor = module.get(ImageCleanupProcessor);
  });

  describe('onModuleInit', () => {
    it('schedules the repeatable cleanup job idempotently', async () => {
      await processor.onModuleInit();

      expect(cleanupQueue.upsertJobScheduler).toHaveBeenCalledWith(
        DELETE_EXPIRED_IMAGES_SCHEDULE_ID,
        { every: expect.any(Number) },
        { name: DELETE_EXPIRED_IMAGES_JOB },
      );
    });
  });

  describe('deleteExpiredImages', () => {
    it('does nothing when there are no expired images', async () => {
      prisma.palmImage.findMany.mockResolvedValue([]);

      await processor.deleteExpiredImages();

      expect(storageService.deleteObject).not.toHaveBeenCalled();
      expect(prisma.palmImage.update).not.toHaveBeenCalled();
    });

    it('only looks for images that expired and were never deleted before', async () => {
      prisma.palmImage.findMany.mockResolvedValue([]);

      await processor.deleteExpiredImages();

      expect(prisma.palmImage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { expiresAt: { lte: expect.any(Date) }, deletedAt: null },
        }),
      );
    });

    it('deletes the object from storage and marks deletedAt as evidence for each expired image', async () => {
      prisma.palmImage.findMany.mockResolvedValue([
        { id: 'image-1', storageKey: 'palm-reading/a.jpg' },
        { id: 'image-2', storageKey: 'palm-reading/b.jpg' },
      ]);
      storageService.deleteObject.mockResolvedValue(undefined);

      await processor.deleteExpiredImages();

      expect(storageService.deleteObject).toHaveBeenCalledWith(
        'palm-reading/a.jpg',
      );
      expect(storageService.deleteObject).toHaveBeenCalledWith(
        'palm-reading/b.jpg',
      );
      expect(prisma.palmImage.update).toHaveBeenCalledWith({
        where: { id: 'image-1' },
        data: { deletedAt: expect.any(Date) },
      });
      expect(prisma.palmImage.update).toHaveBeenCalledWith({
        where: { id: 'image-2' },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it('keeps processing the rest of the batch when deleting one object fails, without marking it deleted', async () => {
      prisma.palmImage.findMany.mockResolvedValue([
        { id: 'image-1', storageKey: 'palm-reading/a.jpg' },
        { id: 'image-2', storageKey: 'palm-reading/b.jpg' },
      ]);
      storageService.deleteObject
        .mockRejectedValueOnce(new Error('network down'))
        .mockResolvedValueOnce(undefined);

      await processor.deleteExpiredImages();

      expect(prisma.palmImage.update).toHaveBeenCalledTimes(1);
      expect(prisma.palmImage.update).toHaveBeenCalledWith({
        where: { id: 'image-2' },
        data: { deletedAt: expect.any(Date) },
      });
    });
  });

  describe('process (BullMQ job entrypoint)', () => {
    it('delegates to deleteExpiredImages', async () => {
      const spy = jest
        .spyOn(processor, 'deleteExpiredImages')
        .mockResolvedValue(undefined);

      await processor.process();

      expect(spy).toHaveBeenCalled();
    });
  });
});
