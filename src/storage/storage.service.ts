import { randomUUID } from 'crypto';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MIME_TYPE_TO_EXTENSION,
  PRESIGNED_UPLOAD_EXPIRY_SECONDS,
  type PalmImageMimeType,
} from './storage.constants';

export interface PresignedUpload {
  key: string;
  uploadUrl: string;
  expiresInSeconds: number;
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private client!: S3Client;
  private bucket!: string;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    this.bucket = this.configService.get<string>('SPACES_BUCKET') as string;
    this.client = new S3Client({
      endpoint: this.configService.get<string>('SPACES_ENDPOINT'),
      region: this.configService.get<string>('SPACES_REGION'),
      // DigitalOcean Spaces y MinIO (usado en local) requieren path-style;
      // ambos lo soportan, así que se fija siempre en vez de exponerlo como
      // variable de entorno adicional.
      forcePathStyle: true,
      credentials: {
        accessKeyId: this.configService.get<string>(
          'SPACES_ACCESS_KEY',
        ) as string,
        secretAccessKey: this.configService.get<string>(
          'SPACES_SECRET_KEY',
        ) as string,
      },
    });

    await this.ensureBucketExists();
  }

  buildPalmImageKey(
    userId: string,
    readingId: string,
    mimeType: PalmImageMimeType,
  ): string {
    const extension = MIME_TYPE_TO_EXTENSION[mimeType];
    return `palm-reading/${userId}/${readingId}/${randomUUID()}.${extension}`;
  }

  buildShareImageKey(readingId: string): string {
    return `share-images/${readingId}/${randomUUID()}.png`;
  }

  // Subida directa desde el servidor (a diferencia de createPresignedUploadUrl,
  // pensada para que el navegador suba directo). El bucket sigue siendo
  // privado — la imagen se sirve siempre a través de un endpoint propio
  // (GET /shared/:token/image) para poder honrar la revocación, nunca con
  // una URL directa al bucket.
  async uploadObject(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async createPresignedUploadUrl(
    key: string,
    contentType: PalmImageMimeType,
  ): Promise<PresignedUpload> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: PRESIGNED_UPLOAD_EXPIRY_SECONDS,
    });

    return {
      key,
      uploadUrl,
      expiresInSeconds: PRESIGNED_UPLOAD_EXPIRY_SECONDS,
    };
  }

  async headObject(key: string): Promise<{ sizeBytes: number } | null> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return { sizeBytes: result.ContentLength ?? 0 };
    } catch {
      return null;
    }
  }

  async downloadObject(key: string): Promise<Buffer> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const bytes = await result.Body?.transformToByteArray();
    if (!bytes) {
      throw new Error(`Empty object body for key "${key}".`);
    }
    return Buffer.from(bytes);
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  private async ensureBucketExists(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.client.send(
          new CreateBucketCommand({ Bucket: this.bucket }),
        );
        this.logger.log(`Created storage bucket "${this.bucket}".`);
      } catch (error) {
        this.logger.warn(
          `Could not verify or create storage bucket "${this.bucket}": ${(error as Error).message}`,
        );
      }
    }
  }
}
