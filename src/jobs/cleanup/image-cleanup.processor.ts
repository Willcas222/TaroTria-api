import { Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { CLEANUP_QUEUE } from '../../queues/queues.module';
import { StorageService } from '../../storage/storage.service';
import {
  CLEANUP_BATCH_SIZE,
  CLEANUP_INTERVAL_MS,
  DELETE_EXPIRED_IMAGES_JOB,
  DELETE_EXPIRED_IMAGES_SCHEDULE_ID,
} from './cleanup.types';

// Borra del bucket las imágenes de palma cuya retención (`PalmImage.expiresAt`,
// sección 17 del plan) ya venció. La fila nunca se borra de la base de datos
// — solo se marca `deletedAt` — para que ese campo sea en sí mismo la
// evidencia de borrado, consultable después de que el archivo real ya no
// exista.
@Processor(CLEANUP_QUEUE)
export class ImageCleanupProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(ImageCleanupProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    @InjectQueue(CLEANUP_QUEUE) private readonly cleanupQueue: Queue,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    // `upsertJobScheduler` es idempotente por `jobSchedulerId`: reiniciar el
    // worker nunca duplica el schedule (BullMQ >= 5.16 reemplazó el patrón
    // `add(..., { repeat })` por este método dedicado).
    await this.cleanupQueue.upsertJobScheduler(
      DELETE_EXPIRED_IMAGES_SCHEDULE_ID,
      { every: CLEANUP_INTERVAL_MS },
      { name: DELETE_EXPIRED_IMAGES_JOB },
    );
  }

  async process(): Promise<void> {
    await this.deleteExpiredImages();
  }

  async deleteExpiredImages(): Promise<void> {
    const expiredImages = await this.prisma.palmImage.findMany({
      where: { expiresAt: { lte: new Date() }, deletedAt: null },
      take: CLEANUP_BATCH_SIZE,
    });

    if (expiredImages.length === 0) {
      return;
    }

    let deletedCount = 0;
    for (const image of expiredImages) {
      try {
        await this.storageService.deleteObject(image.storageKey);
        await this.prisma.palmImage.update({
          where: { id: image.id },
          data: { deletedAt: new Date() },
        });
        deletedCount += 1;
      } catch (error) {
        this.logger.error(
          `Failed to delete expired image ${image.id} (key=${image.storageKey}): ${(error as Error).message}`,
        );
      }
    }

    this.logger.log(
      `Deleted ${deletedCount}/${expiredImages.length} expired palm images.`,
    );
  }
}
