import { Injectable, Logger } from '@nestjs/common';
import { AiOrchestratorService } from '../../ai/ai-orchestrator.service';
import { PromptsService } from '../../ai/prompts.service';
import { PALM_READING_INTERPRETATION_TASK } from '../../ai/tasks/palm-reading-interpretation.schema';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { WalletService } from '../../wallet/wallet.service';
import type { ReadingProcessor } from './reading-processor.interface';

// Lógica de dominio pura: "procesar una lectura de manos hasta un resultado
// final". Mismo patrón que TarotReadingProcessor — no conoce BullMQ, el
// dispatcher (`ReadingProcessingConsumer`) es el único punto conectado a la
// cola y lo invoca por nombre de job.
@Injectable()
export class PalmReadingProcessor implements ReadingProcessor {
  private readonly logger = new Logger(PalmReadingProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly promptsService: PromptsService,
    private readonly aiOrchestrator: AiOrchestratorService,
    private readonly walletService: WalletService,
  ) {}

  async processReading(readingId: string): Promise<void> {
    const reading = await this.prisma.reading.findUnique({
      where: { id: readingId },
      include: {
        palmImages: {
          where: { status: 'VALID' },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!reading) {
      this.logger.warn(`Reading ${readingId} not found, skipping.`);
      return;
    }

    if (reading.status === 'COMPLETED') {
      this.logger.log(`Reading ${readingId} already completed, skipping.`);
      return;
    }

    await this.prisma.reading.update({
      where: { id: readingId },
      data: { status: 'PROCESSING' },
    });

    const promptVersionId = await this.promptsService.getPublishedVersionId(
      PALM_READING_INTERPRETATION_TASK,
    );

    const images = await Promise.all(
      reading.palmImages.map(async (image) => ({
        base64: (
          await this.storageService.downloadObject(image.storageKey)
        ).toString('base64'),
        mimeType: image.mimeType ?? 'image/jpeg',
      })),
    );

    const result = await this.aiOrchestrator.execute({
      promptVersionId,
      readingId,
      variables: {},
      riskCheckText: '',
      images,
    });

    if (result.status === 'COMPLETED') {
      await this.walletService.confirmConsumption(readingId);
    } else {
      await this.walletService.releaseReservation(readingId);
    }

    await this.prisma.reading.update({
      where: { id: readingId },
      data: {
        status: result.status,
        promptVersionId,
      },
    });
  }
}
