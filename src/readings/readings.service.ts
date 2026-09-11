import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import type { Reading, Service } from '@prisma/client';
import {
  VALIDATE_PALM_IMAGE_JOB,
  validateImageJobId,
  type ValidateImageJobData,
} from '../jobs/image-analysis/image-analysis.types';
import {
  PROCESS_PALM_JOB,
  PROCESS_TAROT_JOB,
  palmProcessingJobId,
  palmRetryJobId,
  tarotProcessingJobId,
  tarotRetryJobId,
  type ProcessReadingJobData,
} from '../jobs/reading-processing/reading-processing.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  IMAGE_ANALYSIS_QUEUE,
  READING_PROCESSING_QUEUE,
} from '../queues/queues.module';
import { RewardsService } from '../rewards/rewards.service';
import { SharingService } from '../sharing/sharing.service';
import {
  readImageDimensions,
  sniffImageMimeType,
} from '../storage/image-validation';
import {
  PALM_IMAGE_MIN_DIMENSION_PX,
  type PalmImageMimeType,
} from '../storage/storage.constants';
import type { PresignedUpload } from '../storage/storage.service';
import { StorageService } from '../storage/storage.service';
import { DrawEngineService } from '../tarot/draw-engine.service';
import { DEFAULT_TAROT_DECK_CODE } from '../tarot/tarot.constants';
import { TarotService } from '../tarot/tarot.service';
import { WalletService } from '../wallet/wallet.service';
import { ReadingAlreadySubmittedError } from '../wallet/wallet.types';
import {
  isPalmService,
  requiredPalmImageSlots,
} from './palm-reading.constants';
import { validateReadingAnswers } from './reading-form.validator';
import {
  toAdminReadingSummary,
  toReadingDetail,
  toReadingSummary,
  type PalmImageSummary,
  type PaginatedAdminReadings,
  type ReadingDetail,
  type ReadingSummary,
} from './reading.types';

// Sección 3 del documento de publicidad recompensada ("LECTURA DE TAROT: 5
// anuncios -> desbloquea una lectura"): se escribió pensando en una única
// tirada de tarot. Ahora que existen 3 profundidades (TAROT_THREE/FIVE/TEN),
// el desbloqueo gratis aplica solo a la más básica -- las tiradas más
// profundas siguen siendo exclusivamente de pago.
const AD_UNLOCKABLE_TAROT_SERVICE_CODE = 'TAROT_THREE';

const DETAIL_INCLUDE = {
  service: true,
  spread: { include: { positions: true } },
  input: true,
  draws: { include: { card: true } },
  aiExecutions: {
    where: { status: 'COMPLETED' as const },
    orderBy: { createdAt: 'desc' as const },
    take: 1,
  },
  palmImages: { orderBy: { createdAt: 'asc' as const } },
} as const;

@Injectable()
export class ReadingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tarotService: TarotService,
    private readonly drawEngine: DrawEngineService,
    private readonly storageService: StorageService,
    private readonly configService: ConfigService,
    private readonly walletService: WalletService,
    private readonly sharingService: SharingService,
    private readonly rewardsService: RewardsService,
    @InjectQueue(READING_PROCESSING_QUEUE)
    private readonly readingQueue: Queue<ProcessReadingJobData>,
    @InjectQueue(IMAGE_ANALYSIS_QUEUE)
    private readonly imageAnalysisQueue: Queue<ValidateImageJobData>,
  ) {}

  async create(userId: string, serviceCode: string): Promise<ReadingSummary> {
    const service = await this.prisma.service.findFirst({
      where: { code: serviceCode, isActive: true },
    });
    if (!service) {
      throw new NotFoundException('Servicio no encontrado.');
    }

    // Mapeo por convención: el `code` de la tirada coincide con el `code`
    // del servicio. Servicios sin tirada de tarot (ej. lectura de manos,
    // fuera de esta fase) simplemente no encuentran spread y quedan sin él.
    const spread = await this.prisma.tarotSpread.findFirst({
      where: { code: serviceCode, isActive: true },
    });

    const reading = await this.prisma.reading.create({
      data: { userId, serviceId: service.id, spreadId: spread?.id },
      include: { service: true },
    });

    return toReadingSummary(reading);
  }

  async listForUser(userId: string): Promise<ReadingSummary[]> {
    const readings = await this.prisma.reading.findMany({
      where: { userId },
      include: { service: true },
      orderBy: { createdAt: 'desc' },
    });

    return readings.map(toReadingSummary);
  }

  async findOneForUser(
    userId: string,
    readingId: string,
  ): Promise<ReadingDetail> {
    const reading = await this.prisma.reading.findFirst({
      where: { id: readingId, userId },
      include: DETAIL_INCLUDE,
    });
    if (!reading) {
      throw new NotFoundException('Lectura no encontrada.');
    }

    const share = await this.sharingService.getActiveShareLinkSummary(
      reading.id,
    );
    return toReadingDetail(reading, share);
  }

  async updateInputs(
    userId: string,
    readingId: string,
    answers: Record<string, unknown>,
  ): Promise<ReadingDetail> {
    const reading = await this.findOwnedDraft(userId, readingId);

    const service = await this.prisma.service.findUniqueOrThrow({
      where: { id: reading.serviceId },
      include: { forms: { where: { isActive: true }, take: 1 } },
    });
    const activeForm = service.forms[0];
    if (!activeForm) {
      throw new BadRequestException(
        'Este servicio no tiene un formulario configurado.',
      );
    }

    validateReadingAnswers(activeForm.schema, answers);

    await this.prisma.readingInput.upsert({
      where: { readingId },
      update: { formVersion: activeForm.version, answers: answers as never },
      create: {
        readingId,
        formVersion: activeForm.version,
        answers: answers as never,
      },
    });

    return this.findOneForUser(userId, readingId);
  }

  async presignImage(
    userId: string,
    readingId: string,
    contentType: PalmImageMimeType,
  ): Promise<PresignedUpload> {
    const reading = await this.findOwnedDraft(userId, readingId);

    const service = await this.prisma.service.findUniqueOrThrow({
      where: { id: reading.serviceId },
    });
    if (!isPalmService(service.code)) {
      throw new BadRequestException(
        'Este servicio no acepta imágenes de palma.',
      );
    }

    const existingSlots = await this.prisma.palmImage.count({
      where: { readingId, status: { not: 'INVALID' } },
    });
    if (existingSlots >= requiredPalmImageSlots(service.code)) {
      throw new BadRequestException(
        'Ya alcanzaste el número de imágenes requeridas para este servicio.',
      );
    }

    const key = this.storageService.buildPalmImageKey(
      userId,
      readingId,
      contentType,
    );

    await this.prisma.palmImage.create({
      data: { readingId, storageKey: key, status: 'UPLOADED' },
    });

    return this.storageService.createPresignedUploadUrl(key, contentType);
  }

  async confirmImage(
    userId: string,
    readingId: string,
    key: string,
  ): Promise<PalmImageSummary> {
    await this.findOwnedDraft(userId, readingId);

    const image = await this.prisma.palmImage.findFirst({
      where: { readingId, storageKey: key },
    });
    if (!image) {
      throw new NotFoundException('Imagen no encontrada.');
    }
    if (image.status !== 'UPLOADED') {
      throw new BadRequestException('Esta imagen ya fue confirmada.');
    }

    const invalidate = async (reason: string) => {
      const updated = await this.prisma.palmImage.update({
        where: { id: image.id },
        data: { status: 'INVALID', validationError: reason },
      });
      return this.toPalmImageSummary(updated);
    };

    const head = await this.storageService.headObject(key);
    if (!head || head.sizeBytes <= 0) {
      return invalidate(
        'No se encontró el archivo cargado. Intenta subirlo de nuevo.',
      );
    }

    const maxSizeBytes = this.configService.get<number>(
      'PALM_IMAGE_MAX_SIZE_BYTES',
    ) as number;
    if (head.sizeBytes > maxSizeBytes) {
      return invalidate('El archivo supera el tamaño máximo permitido.');
    }

    const bytes = await this.storageService.downloadObject(key);

    const realMimeType = sniffImageMimeType(bytes);
    if (!realMimeType) {
      return invalidate('El archivo no es una imagen JPEG, PNG o WebP válida.');
    }

    const dimensions = readImageDimensions(bytes);
    if (
      !dimensions ||
      dimensions.widthPx < PALM_IMAGE_MIN_DIMENSION_PX ||
      dimensions.heightPx < PALM_IMAGE_MIN_DIMENSION_PX
    ) {
      return invalidate('La imagen es demasiado pequeña o está corrupta.');
    }

    const retentionHours = this.configService.get<number>(
      'PALM_IMAGE_RETENTION_HOURS',
    ) as number;
    const expiresAt = new Date(Date.now() + retentionHours * 60 * 60 * 1000);

    const updated = await this.prisma.palmImage.update({
      where: { id: image.id },
      data: {
        status: 'PENDING_REVIEW',
        mimeType: realMimeType,
        sizeBytes: head.sizeBytes,
        widthPx: dimensions.widthPx,
        heightPx: dimensions.heightPx,
        consentAt: new Date(),
        expiresAt,
        validationError: null,
      },
    });

    await this.imageAnalysisQueue.add(
      VALIDATE_PALM_IMAGE_JOB,
      { palmImageId: image.id },
      { jobId: validateImageJobId(image.id) },
    );

    return this.toPalmImageSummary(updated);
  }

  async submit(userId: string, readingId: string): Promise<ReadingDetail> {
    const reading = await this.findOwnedDraft(userId, readingId);
    const service = await this.prisma.service.findUniqueOrThrow({
      where: { id: reading.serviceId },
    });

    if (isPalmService(service.code)) {
      return this.submitPalmReading(userId, readingId, service);
    }

    return this.submitTarotReading(userId, readingId, reading, service);
  }

  private async submitPalmReading(
    userId: string,
    readingId: string,
    service: Service,
  ): Promise<ReadingDetail> {
    const validImages = await this.prisma.palmImage.count({
      where: { readingId, status: 'VALID' },
    });
    if (validImages < requiredPalmImageSlots(service.code)) {
      throw new BadRequestException(
        'Debes subir y validar tus fotos de palma antes de enviar la lectura.',
      );
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await this.walletService.reserveCreditsForReading(
          tx,
          userId,
          readingId,
          service.creditCost,
        );
        await tx.reading.update({
          where: { id: readingId },
          data: { status: 'PENDING', submittedAt: new Date() },
        });
      });
    } catch (error) {
      if (error instanceof ReadingAlreadySubmittedError) {
        return this.findOneForUser(userId, readingId);
      }
      throw error;
    }

    await this.readingQueue.add(
      PROCESS_PALM_JOB,
      { readingId },
      { jobId: palmProcessingJobId(readingId) },
    );

    return this.findOneForUser(userId, readingId);
  }

  private async submitTarotReading(
    userId: string,
    readingId: string,
    reading: Reading,
    service: Service,
  ): Promise<ReadingDetail> {
    const input = await this.prisma.readingInput.findUnique({
      where: { readingId },
    });
    if (!input) {
      throw new BadRequestException(
        'Debes completar el formulario antes de enviar la lectura.',
      );
    }

    if (!reading.spreadId) {
      throw new BadRequestException(
        'Este servicio todavía no tiene una tirada de tarot configurada.',
      );
    }

    const spread = await this.prisma.tarotSpread.findUniqueOrThrow({
      where: { id: reading.spreadId },
      include: { positions: { orderBy: { orderIndex: 'asc' } } },
    });

    const deck = await this.tarotService.getActiveDeckCards(
      DEFAULT_TAROT_DECK_CODE,
    );
    const draws = this.drawEngine.draw(
      deck,
      spread.positions.map((p) => p.code),
    );

    try {
      await this.prisma.$transaction(async (tx) => {
        // El sistema decide solo si esta lectura se paga con créditos o ya
        // fue ganada viendo anuncios (sección 1 del documento de tiradas:
        // "sistema determina si utilizar tokens o desbloqueo mediante
        // publicidad") -- nunca depende de lo que diga el frontend. El
        // consumo del desbloqueo va en la misma transacción que la reserva
        // de créditos: si algo falla a la mitad, no se pierde el anuncio ya
        // visto ni se cobra por una lectura que no se llegó a crear.
        let creditCost = service.creditCost;
        if (service.code === AD_UNLOCKABLE_TAROT_SERVICE_CODE) {
          const unlockedViaAds = await this.rewardsService.tryConsumeUnlock(
            userId,
            'TAROT_READING_UNLOCK',
            tx,
          );
          if (unlockedViaAds) {
            creditCost = 0;
          }
        }

        await this.walletService.reserveCreditsForReading(
          tx,
          userId,
          readingId,
          creditCost,
        );
        await tx.tarotDraw.createMany({
          data: draws.map((draw) => ({
            readingId,
            position: draw.position,
            cardId: draw.card.id,
            orientation: draw.orientation,
          })),
        });
        await tx.reading.update({
          where: { id: readingId },
          data: { status: 'PENDING', submittedAt: new Date() },
        });
      });
    } catch (error) {
      if (error instanceof ReadingAlreadySubmittedError) {
        return this.findOneForUser(userId, readingId);
      }
      throw error;
    }

    await this.readingQueue.add(
      PROCESS_TAROT_JOB,
      { readingId },
      { jobId: tarotProcessingJobId(readingId) },
    );

    return this.findOneForUser(userId, readingId);
  }

  // Sección 8 del plan: "una lectura no vuelve a cobrar por reintentos
  // técnicos". No se toca el wallet en absoluto: los créditos ya se
  // devolvieron cuando la lectura llegó a FAILED (por el processor o por
  // `ReadingProcessingConsumer.onFailed`), y tanto `confirmConsumption`
  // como `releaseReservation` son idempotentes si el processor los vuelve a
  // llamar durante este reintento — no hacen nada porque la reserva ya no
  // está ACTIVE.
  async retry(userId: string, readingId: string): Promise<ReadingDetail> {
    const reading = await this.prisma.reading.findFirst({
      where: { id: readingId, userId },
      include: { service: true },
    });
    if (!reading) {
      throw new NotFoundException('Lectura no encontrada.');
    }

    await this.performRetry(reading);
    return this.findOneForUser(userId, readingId);
  }

  async retryAsAdmin(readingId: string): Promise<ReadingDetail> {
    const reading = await this.prisma.reading.findUnique({
      where: { id: readingId },
      include: { service: true },
    });
    if (!reading) {
      throw new NotFoundException('Lectura no encontrada.');
    }

    await this.performRetry(reading);
    return this.findOneForUser(reading.userId, readingId);
  }

  private async performRetry(
    reading: Reading & { service: Service },
  ): Promise<void> {
    if (reading.status !== 'FAILED') {
      throw new BadRequestException(
        'Solo se pueden reintentar lecturas en estado FAILED.',
      );
    }

    await this.prisma.reading.update({
      where: { id: reading.id },
      data: { status: 'PENDING' },
    });

    if (isPalmService(reading.service.code)) {
      await this.readingQueue.add(
        PROCESS_PALM_JOB,
        { readingId: reading.id },
        { jobId: palmRetryJobId(reading.id) },
      );
    } else {
      await this.readingQueue.add(
        PROCESS_TAROT_JOB,
        { readingId: reading.id },
        { jobId: tarotRetryJobId(reading.id) },
      );
    }
  }

  async remove(userId: string, readingId: string): Promise<void> {
    await this.findOwnedDraft(userId, readingId);

    // Las filas de PalmImage se borran en cascada junto con la lectura, pero
    // eso no borra el objeto real del bucket. Sin esto, borrar un DRAFT con
    // imágenes ya subidas dejaría archivos huérfanos que el job de limpieza
    // (que busca por PalmImage.expiresAt) nunca encontraría, porque la fila
    // ya no existiría.
    const images = await this.prisma.palmImage.findMany({
      where: { readingId },
    });
    await Promise.all(
      images.map((image) => this.storageService.deleteObject(image.storageKey)),
    );

    await this.prisma.reading.delete({ where: { id: readingId } });
  }

  async listAllForAdmin(
    page: number,
    pageSize: number,
    status?: Reading['status'],
  ): Promise<PaginatedAdminReadings> {
    const where = status ? { status } : {};

    const [items, total] = await Promise.all([
      this.prisma.reading.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { service: true, user: { select: { id: true, email: true } } },
      }),
      this.prisma.reading.count({ where }),
    ]);

    return {
      items: items.map(toAdminReadingSummary),
      total,
      page,
      pageSize,
    };
  }

  private toPalmImageSummary(image: {
    id: string;
    status: PalmImageSummary['status'];
    validationError: string | null;
  }): PalmImageSummary {
    return {
      id: image.id,
      status: image.status,
      validationError: image.validationError,
    };
  }

  private async findOwnedDraft(
    userId: string,
    readingId: string,
  ): Promise<Reading> {
    const reading = await this.prisma.reading.findFirst({
      where: { id: readingId, userId },
    });
    if (!reading) {
      throw new NotFoundException('Lectura no encontrada.');
    }
    if (reading.status !== 'DRAFT') {
      throw new BadRequestException(
        'Esta lectura ya fue enviada y no se puede modificar.',
      );
    }
    return reading;
  }
}
