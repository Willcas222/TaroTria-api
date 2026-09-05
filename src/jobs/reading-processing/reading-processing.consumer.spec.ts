import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { WalletService } from '../../wallet/wallet.service';
import { PalmReadingProcessor } from './palm-reading.processor';
import { ReadingProcessingConsumer } from './reading-processing.consumer';
import { TarotReadingProcessor } from './tarot-reading.processor';

describe('ReadingProcessingConsumer', () => {
  let consumer: ReadingProcessingConsumer;
  let prisma: { reading: { updateMany: jest.Mock } };
  let walletService: { releaseReservation: jest.Mock };
  let tarotReadingProcessor: { processReading: jest.Mock };
  let palmReadingProcessor: { processReading: jest.Mock };

  beforeEach(async () => {
    prisma = { reading: { updateMany: jest.fn() } };
    walletService = {
      releaseReservation: jest.fn().mockResolvedValue(undefined),
    };
    tarotReadingProcessor = { processReading: jest.fn() };
    palmReadingProcessor = { processReading: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        ReadingProcessingConsumer,
        { provide: PrismaService, useValue: prisma },
        { provide: WalletService, useValue: walletService },
        { provide: TarotReadingProcessor, useValue: tarotReadingProcessor },
        { provide: PalmReadingProcessor, useValue: palmReadingProcessor },
      ],
    }).compile();

    consumer = module.get(ReadingProcessingConsumer);
  });

  describe('process', () => {
    it('routes a PROCESS_TAROT job to TarotReadingProcessor', async () => {
      await consumer.process({
        name: 'PROCESS_TAROT',
        data: { readingId: 'reading-1' },
      } as never);

      expect(tarotReadingProcessor.processReading).toHaveBeenCalledWith(
        'reading-1',
      );
    });

    it('routes a PROCESS_PALM job to PalmReadingProcessor', async () => {
      await consumer.process({
        name: 'PROCESS_PALM',
        data: { readingId: 'reading-1' },
      } as never);

      expect(palmReadingProcessor.processReading).toHaveBeenCalledWith(
        'reading-1',
      );
      expect(tarotReadingProcessor.processReading).not.toHaveBeenCalled();
    });

    it('throws for a job name with no registered processor, instead of silently routing it to the wrong one', async () => {
      await expect(
        consumer.process({
          name: 'SOME_UNKNOWN_JOB',
          data: { readingId: 'reading-1' },
        } as never),
      ).rejects.toThrow(/No hay un processor registrado/);

      expect(tarotReadingProcessor.processReading).not.toHaveBeenCalled();
    });
  });

  describe('onFailed', () => {
    it('does nothing while attempts remain', async () => {
      await consumer.onFailed(
        {
          data: { readingId: 'reading-1' },
          attemptsMade: 1,
          opts: { attempts: 3 },
        } as never,
        new Error('boom'),
      );

      expect(prisma.reading.updateMany).not.toHaveBeenCalled();
    });

    it('marks the reading FAILED and releases its credit reservation once every attempt is exhausted, regardless of job type', async () => {
      await consumer.onFailed(
        {
          data: { readingId: 'reading-1' },
          attemptsMade: 3,
          opts: { attempts: 3 },
        } as never,
        new Error('boom'),
      );

      expect(walletService.releaseReservation).toHaveBeenCalledWith(
        'reading-1',
      );
      expect(prisma.reading.updateMany).toHaveBeenCalledWith({
        where: { id: 'reading-1', status: { not: 'COMPLETED' } },
        data: { status: 'FAILED' },
      });
    });
  });
});
