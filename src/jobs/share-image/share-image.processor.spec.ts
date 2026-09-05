import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { SharingService } from '../../sharing/sharing.service';
import { StorageService } from '../../storage/storage.service';
import { ShareImageProcessor } from './share-image.processor';

const toBufferMock = jest.fn().mockResolvedValue(Buffer.from('fake-png'));
const pngMock = jest.fn(() => ({ toBuffer: toBufferMock }));
jest.mock('sharp', () => jest.fn(() => ({ png: pngMock })));

const pendingShareLink = {
  id: 'share-1',
  readingId: 'reading-1',
  imageKey: null,
  imageStatus: 'PENDING' as const,
  revokedAt: null,
};

describe('ShareImageProcessor', () => {
  let processor: ShareImageProcessor;
  let prisma: { shareLink: { findUnique: jest.Mock } };
  let sharingService: {
    getSanitizedReadingData: jest.Mock;
    markImageReady: jest.Mock;
    markImageFailed: jest.Mock;
  };
  let storageService: {
    buildShareImageKey: jest.Mock;
    uploadObject: jest.Mock;
  };
  let configService: { get: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();
    toBufferMock.mockResolvedValue(Buffer.from('fake-png'));

    prisma = { shareLink: { findUnique: jest.fn() } };
    sharingService = {
      getSanitizedReadingData: jest.fn().mockResolvedValue({
        readingType: 'TAROT',
        title: 'Hice una lectura de tarot en TAROTRIA',
        cards: [],
      }),
      markImageReady: jest.fn().mockResolvedValue(undefined),
      markImageFailed: jest.fn().mockResolvedValue(undefined),
    };
    storageService = {
      buildShareImageKey: jest
        .fn()
        .mockReturnValue('share-images/reading-1/x.png'),
      uploadObject: jest.fn().mockResolvedValue(undefined),
    };
    configService = {
      get: jest.fn().mockReturnValue('https://app.example.com'),
    };

    const module = await Test.createTestingModule({
      providers: [
        ShareImageProcessor,
        { provide: PrismaService, useValue: prisma },
        { provide: SharingService, useValue: sharingService },
        { provide: StorageService, useValue: storageService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    processor = module.get(ShareImageProcessor);
  });

  describe('generateImage', () => {
    it('does nothing when the share link no longer exists', async () => {
      prisma.shareLink.findUnique.mockResolvedValue(null);

      await processor.generateImage('missing');

      expect(sharingService.getSanitizedReadingData).not.toHaveBeenCalled();
      expect(storageService.uploadObject).not.toHaveBeenCalled();
    });

    it('does nothing when the link was revoked before rendering', async () => {
      prisma.shareLink.findUnique.mockResolvedValue({
        ...pendingShareLink,
        revokedAt: new Date(),
      });

      await processor.generateImage('share-1');

      expect(sharingService.getSanitizedReadingData).not.toHaveBeenCalled();
      expect(storageService.uploadObject).not.toHaveBeenCalled();
    });

    it('renders, uploads, and marks the link READY with the resulting key', async () => {
      prisma.shareLink.findUnique.mockResolvedValue(pendingShareLink);

      await processor.generateImage('share-1');

      expect(sharingService.getSanitizedReadingData).toHaveBeenCalledWith(
        'reading-1',
      );
      expect(storageService.uploadObject).toHaveBeenCalledWith(
        'share-images/reading-1/x.png',
        Buffer.from('fake-png'),
        'image/png',
      );
      expect(sharingService.markImageReady).toHaveBeenCalledWith(
        'share-1',
        'share-images/reading-1/x.png',
      );
    });
  });

  describe('process (BullMQ job entrypoint)', () => {
    it('delegates to generateImage with the job data', async () => {
      const spy = jest
        .spyOn(processor, 'generateImage')
        .mockResolvedValue(undefined);

      await processor.process({
        data: { shareLinkId: 'share-42' },
      } as never);

      expect(spy).toHaveBeenCalledWith('share-42');
    });
  });

  describe('onFailed', () => {
    it('does nothing while attempts remain', async () => {
      await processor.onFailed({
        data: { shareLinkId: 'share-1' },
        attemptsMade: 1,
        opts: { attempts: 3 },
      } as never);

      expect(sharingService.markImageFailed).not.toHaveBeenCalled();
    });

    it('marks the image FAILED once every attempt is exhausted', async () => {
      await processor.onFailed({
        data: { shareLinkId: 'share-1' },
        attemptsMade: 3,
        opts: { attempts: 3 },
      } as never);

      expect(sharingService.markImageFailed).toHaveBeenCalledWith('share-1');
    });
  });
});
