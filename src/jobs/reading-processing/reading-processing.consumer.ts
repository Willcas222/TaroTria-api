import { Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import * as Sentry from '@sentry/nestjs';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { READING_PROCESSING_QUEUE } from '../../queues/queues.module';
import { WalletService } from '../../wallet/wallet.service';
import { PalmReadingProcessor } from './palm-reading.processor';
import type { ReadingProcessor } from './reading-processor.interface';
import {
  PROCESS_PALM_JOB,
  PROCESS_TAROT_JOB,
  type ProcessReadingJobData,
} from './reading-processing.types';
import { TarotReadingProcessor } from './tarot-reading.processor';

// Único punto conectado a BullMQ para la cola `reading-processing`: enruta
// cada job a su processor de dominio según `job.name`, para que agregar un
// nuevo tipo de lectura (ej. `PROCESS_PALM`) nunca sea recogido por error por
// el processor de otro tipo (ambos comparten la misma forma de `data`).
@Processor(READING_PROCESSING_QUEUE)
export class ReadingProcessingConsumer extends WorkerHost {
  private readonly logger = new Logger(ReadingProcessingConsumer.name);
  private readonly processorsByJobName: Record<string, ReadingProcessor>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
    tarotReadingProcessor: TarotReadingProcessor,
    palmReadingProcessor: PalmReadingProcessor,
  ) {
    super();
    this.processorsByJobName = {
      [PROCESS_TAROT_JOB]: tarotReadingProcessor,
      [PROCESS_PALM_JOB]: palmReadingProcessor,
    };
  }

  async process(job: Job<ProcessReadingJobData>): Promise<void> {
    const processor = this.processorsByJobName[job.name];
    if (!processor) {
      throw new Error(`No hay un processor registrado para "${job.name}".`);
    }

    await processor.processReading(job.data.readingId);
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<ProcessReadingJobData>, error: Error): Promise<void> {
    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < maxAttempts) {
      return;
    }

    this.logger.error(
      `Reading ${job.data.readingId} failed permanently after ${job.attemptsMade} attempts.`,
    );
    Sentry.captureException(error, {
      extra: { readingId: job.data.readingId, jobName: job.name },
    });

    // Fallo definitivo de infraestructura (no del proveedor de IA, ya
    // manejado por el propio processor): igual hay que liberar la reserva,
    // nunca dejar créditos debitados sin una lectura que los consuma.
    await this.walletService.releaseReservation(job.data.readingId);

    await this.prisma.reading.updateMany({
      where: { id: job.data.readingId, status: { not: 'COMPLETED' } },
      data: { status: 'FAILED' },
    });
  }
}
