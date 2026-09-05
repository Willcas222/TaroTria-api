const sendMock = jest.fn();
const getSignedUrlMock = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: sendMock })),
  PutObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
  HeadObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
  GetObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
  DeleteObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
  HeadBucketCommand: jest.fn().mockImplementation((input) => ({ input })),
  CreateBucketCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: getSignedUrlMock,
}));

import type { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';

describe('StorageService', () => {
  let service: StorageService;
  let configService: { get: jest.Mock };

  beforeEach(() => {
    sendMock.mockReset();
    getSignedUrlMock.mockReset();
    configService = {
      get: jest.fn(
        (key: string) =>
          ({
            SPACES_BUCKET: 'test-bucket',
            SPACES_ENDPOINT: 'http://localhost:9000',
            SPACES_REGION: 'us-east-1',
            SPACES_ACCESS_KEY: 'key',
            SPACES_SECRET_KEY: 'secret',
          })[key],
      ),
    };
    service = new StorageService(configService as unknown as ConfigService);
  });

  describe('buildPalmImageKey', () => {
    it('builds a server-controlled key with the extension derived from the MIME type', async () => {
      sendMock.mockResolvedValue({});
      await service.onModuleInit();

      const key = service.buildPalmImageKey('user-1', 'reading-1', 'image/png');

      expect(key).toMatch(
        /^palm-reading\/user-1\/reading-1\/[0-9a-f-]{36}\.png$/,
      );
    });
  });

  describe('onModuleInit', () => {
    it('does not attempt to create the bucket when it already exists', async () => {
      sendMock.mockResolvedValue({});

      await service.onModuleInit();

      expect(sendMock).toHaveBeenCalledTimes(1);
    });

    it('creates the bucket when HeadBucket fails', async () => {
      sendMock
        .mockRejectedValueOnce(new Error('NotFound'))
        .mockResolvedValueOnce({});

      await service.onModuleInit();

      expect(sendMock).toHaveBeenCalledTimes(2);
    });

    it('does not throw when the bucket cannot be created either (e.g. missing permissions)', async () => {
      sendMock
        .mockRejectedValueOnce(new Error('NotFound'))
        .mockRejectedValueOnce(new Error('AccessDenied'));

      await expect(service.onModuleInit()).resolves.not.toThrow();
    });
  });

  describe('createPresignedUploadUrl', () => {
    it('returns a presigned PUT URL for the given key and content type', async () => {
      sendMock.mockResolvedValue({});
      await service.onModuleInit();
      getSignedUrlMock.mockResolvedValue('https://storage.local/signed-put');

      const result = await service.createPresignedUploadUrl(
        'palm-reading/user-1/reading-1/abc.jpg',
        'image/jpeg',
      );

      expect(result).toEqual({
        key: 'palm-reading/user-1/reading-1/abc.jpg',
        uploadUrl: 'https://storage.local/signed-put',
        expiresInSeconds: 300,
      });
    });
  });

  describe('headObject', () => {
    it('returns the size when the object exists', async () => {
      sendMock.mockResolvedValueOnce({}); // onModuleInit
      await service.onModuleInit();
      sendMock.mockResolvedValueOnce({ ContentLength: 2048 });

      const result = await service.headObject('some-key');

      expect(result).toEqual({ sizeBytes: 2048 });
    });

    it('returns null when the object does not exist', async () => {
      sendMock.mockResolvedValueOnce({}); // onModuleInit
      await service.onModuleInit();
      sendMock.mockRejectedValueOnce(new Error('NotFound'));

      const result = await service.headObject('missing-key');

      expect(result).toBeNull();
    });
  });

  describe('deleteObject', () => {
    it('sends a DeleteObjectCommand for the given key', async () => {
      sendMock.mockResolvedValueOnce({}); // onModuleInit
      await service.onModuleInit();
      sendMock.mockResolvedValueOnce({});

      await service.deleteObject('some-key');

      expect(sendMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({ Key: 'some-key' }),
        }),
      );
    });
  });
});
