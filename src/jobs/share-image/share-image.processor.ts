import { Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import sharp from 'sharp';
import { DAILY_CARD_DISCLAIMER } from '../../daily-card/daily-card.constants';
import { PrismaService } from '../../prisma/prisma.service';
import { SHARE_IMAGE_QUEUE } from '../../queues/queues.module';
import { SharingService } from '../../sharing/sharing.service';
import { StorageService } from '../../storage/storage.service';
import { buildShareImageSvg } from './share-image.renderer';
import type { GenerateShareImageJobData } from './share-image.types';

@Processor(SHARE_IMAGE_QUEUE)
export class ShareImageProcessor extends WorkerHost {
  private readonly logger = new Logger(ShareImageProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sharingService: SharingService,
    private readonly storageService: StorageService,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  async process(job: Job<GenerateShareImageJobData>): Promise<void> {
    await this.generateImage(job.data.shareLinkId);
  }

  async generateImage(shareLinkId: string): Promise<void> {
    const shareLink = await this.prisma.shareLink.findUnique({
      where: { id: shareLinkId },
    });

    if (!shareLink) {
      this.logger.warn(`ShareLink ${shareLinkId} not found, skipping.`);
      return;
    }
    if (shareLink.revokedAt) {
      this.logger.log(
        `ShareLink ${shareLinkId} was revoked before its image could render, skipping.`,
      );
      return;
    }

    const data = await this.sharingService.getSanitizedReadingData(
      shareLink.readingId,
    );
    const appUrl = this.configService.get<string>('app.url') as string;

    const svg = buildShareImageSvg({
      ...data,
      disclaimer: DAILY_CARD_DISCLAIMER,
      appHost: new URL(appUrl).host,
    });

    const buffer = await sharp(Buffer.from(svg)).png().toBuffer();

    const key = this.storageService.buildShareImageKey(shareLink.readingId);
    await this.storageService.uploadObject(key, buffer, 'image/png');

    await this.sharingService.markImageReady(shareLinkId, key);
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<GenerateShareImageJobData>): Promise<void> {
    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < maxAttempts) {
      return;
    }

    this.logger.error(
      `Share image generation for ShareLink ${job.data.shareLinkId} failed permanently after ${job.attemptsMade} attempts.`,
    );

    await this.sharingService.markImageFailed(job.data.shareLinkId);
  }
}
