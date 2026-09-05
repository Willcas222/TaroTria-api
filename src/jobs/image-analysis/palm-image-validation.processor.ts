import { Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { AiOrchestratorService } from '../../ai/ai-orchestrator.service';
import { PromptsService } from '../../ai/prompts.service';
import { PALM_IMAGE_LEGIBILITY_TASK } from '../../ai/tasks/palm-legibility.schema';
import type { PalmImageLegibility } from '../../ai/tasks/palm-legibility.schema';
import { PrismaService } from '../../prisma/prisma.service';
import { IMAGE_ANALYSIS_QUEUE } from '../../queues/queues.module';
import { StorageService } from '../../storage/storage.service';
import type { ValidateImageJobData } from './image-analysis.types';

const GENERIC_FAILURE_MESSAGE = 'No fue posible validar la imagen.';

@Processor(IMAGE_ANALYSIS_QUEUE)
export class PalmImageValidationProcessor extends WorkerHost {
  private readonly logger = new Logger(PalmImageValidationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly promptsService: PromptsService,
    private readonly aiOrchestrator: AiOrchestratorService,
  ) {
    super();
  }

  async process(job: Job<ValidateImageJobData>): Promise<void> {
    await this.validateImage(job.data.palmImageId);
  }

  async validateImage(palmImageId: string): Promise<void> {
    const image = await this.prisma.palmImage.findUnique({
      where: { id: palmImageId },
    });

    if (!image) {
      this.logger.warn(`PalmImage ${palmImageId} not found, skipping.`);
      return;
    }

    if (image.status !== 'PENDING_REVIEW') {
      this.logger.log(
        `PalmImage ${palmImageId} is no longer PENDING_REVIEW (status=${image.status}), skipping.`,
      );
      return;
    }

    const bytes = await this.storageService.downloadObject(image.storageKey);
    const promptVersionId = await this.promptsService.getPublishedVersionId(
      PALM_IMAGE_LEGIBILITY_TASK,
    );

    const result = await this.aiOrchestrator.execute({
      promptVersionId,
      readingId: image.readingId,
      variables: {},
      riskCheckText: '',
      images: [
        {
          base64: bytes.toString('base64'),
          mimeType: image.mimeType ?? 'image/jpeg',
        },
      ],
    });

    if (result.status === 'COMPLETED') {
      const output = result.output as PalmImageLegibility;
      await this.prisma.palmImage.update({
        where: { id: palmImageId },
        data: output.isLegiblePalm
          ? { status: 'VALID', validationError: null }
          : { status: 'INVALID', validationError: output.reason },
      });
      return;
    }

    await this.prisma.palmImage.update({
      where: { id: palmImageId },
      data: {
        status: 'INVALID',
        validationError: result.errorMessage ?? GENERIC_FAILURE_MESSAGE,
      },
    });
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<ValidateImageJobData>): Promise<void> {
    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < maxAttempts) {
      return;
    }

    this.logger.error(
      `PalmImage ${job.data.palmImageId} validation failed permanently after ${job.attemptsMade} attempts.`,
    );

    await this.prisma.palmImage.updateMany({
      where: { id: job.data.palmImageId, status: { not: 'VALID' } },
      data: { status: 'INVALID', validationError: GENERIC_FAILURE_MESSAGE },
    });
  }
}
