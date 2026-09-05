import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ShareLink } from '@prisma/client';
import type { Queue } from 'bullmq';
import { DAILY_CARD_DISCLAIMER } from '../daily-card/daily-card.constants';
import {
  generateShareImageJobId,
  GENERATE_SHARE_IMAGE_JOB,
  type GenerateShareImageJobData,
} from '../jobs/share-image/share-image.types';
import { PrismaService } from '../prisma/prisma.service';
import { SHARE_IMAGE_QUEUE } from '../queues/queues.module';
import { isPalmService } from '../readings/palm-reading.constants';
import { StorageService } from '../storage/storage.service';
import {
  ANALYTICS_EVENT_TYPES,
  GENERIC_SHARE_TITLES,
  type AnalyticsEventType,
} from './sharing.constants';
import type {
  SanitizedReadingData,
  SharedSummary,
  ShareLinkCreated,
} from './sharing.types';

const READING_WITH_DRAWS_INCLUDE = {
  service: true,
  spread: { include: { positions: true } },
  draws: { include: { card: true } },
} as const;

@Injectable()
export class SharingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly storageService: StorageService,
    @InjectQueue(SHARE_IMAGE_QUEUE)
    private readonly shareImageQueue: Queue<GenerateShareImageJobData>,
  ) {}

  // Idempotente por diseño: si ya hay un enlace activo para la lectura, lo
  // devuelve en vez de crear uno nuevo (el id ya sirve de token público, así
  // que no hay nada que "perder" al reutilizarlo — a diferencia de un
  // secreto hasheado, aquí sí se puede consultar de nuevo).
  async createShareLink(
    userId: string,
    readingId: string,
  ): Promise<ShareLinkCreated> {
    const reading = await this.prisma.reading.findFirst({
      where: { id: readingId, userId },
    });
    if (!reading) {
      throw new NotFoundException('Lectura no encontrada.');
    }
    if (reading.status !== 'COMPLETED') {
      throw new BadRequestException(
        'Solo se puede compartir una lectura completada.',
      );
    }

    const existing = await this.prisma.shareLink.findFirst({
      where: { readingId, revokedAt: null },
    });
    if (existing) {
      return this.toShareLinkCreated(existing);
    }

    const shareLink = await this.prisma.shareLink.create({
      data: { readingId },
    });

    await this.shareImageQueue.add(
      GENERATE_SHARE_IMAGE_JOB,
      { shareLinkId: shareLink.id },
      { jobId: generateShareImageJobId(shareLink.id) },
    );

    await this.logEvent(
      ANALYTICS_EVENT_TYPES.SHARE_CREATED,
      shareLink.id,
      null,
    );

    return this.toShareLinkCreated(shareLink);
  }

  // Consulta pura, sin crear nada — usada por ReadingsService para exponer
  // en GET /readings/:id si la lectura ya tiene un enlace activo, sin que el
  // usuario tenga que volver a hacer clic en "compartir" para verlo.
  async getActiveShareLinkSummary(
    readingId: string,
  ): Promise<ShareLinkCreated | null> {
    const shareLink = await this.prisma.shareLink.findFirst({
      where: { readingId, revokedAt: null },
    });
    return shareLink ? this.toShareLinkCreated(shareLink) : null;
  }

  // Idempotente: revocar un enlace ya revocado (o inexistente) no hace nada.
  async revokeShareLink(userId: string, readingId: string): Promise<void> {
    const reading = await this.prisma.reading.findFirst({
      where: { id: readingId, userId },
    });
    if (!reading) {
      throw new NotFoundException('Lectura no encontrada.');
    }

    const active = await this.prisma.shareLink.findFirst({
      where: { readingId, revokedAt: null },
    });
    if (!active) {
      return;
    }

    await this.prisma.shareLink.update({
      where: { id: active.id },
      data: { revokedAt: new Date() },
    });
    await this.logEvent(ANALYTICS_EVENT_TYPES.SHARE_REVOKED, active.id, null);
  }

  // Público, sin autenticación: un enlace revocado o de una lectura que ya
  // no está COMPLETED responde 404 igual que uno inexistente, para no
  // revelar cuál de los dos casos es (mismo principio ya usado en
  // ReadingsService: 404, nunca 403, para no filtrar existencia).
  async getPublicSummary(token: string): Promise<SharedSummary> {
    const shareLink = await this.findActiveShareLink(token);
    const data = await this.getSanitizedReadingData(shareLink.readingId);

    await this.logEvent(ANALYTICS_EVENT_TYPES.SHARE_VIEWED, shareLink.id, null);

    return {
      ...data,
      disclaimer: DAILY_CARD_DISCLAIMER,
      imageStatus: shareLink.imageStatus,
      imageUrl:
        shareLink.imageStatus === 'READY'
          ? `${this.configService.get<string>('app.apiUrl')}/shared/${token}/image`
          : null,
    };
  }

  async getShareImageBytes(
    token: string,
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    let shareLink: ShareLink;
    try {
      shareLink = await this.findActiveShareLink(token);
    } catch {
      return null;
    }
    if (shareLink.imageStatus !== 'READY' || !shareLink.imageKey) {
      return null;
    }

    const buffer = await this.storageService.downloadObject(shareLink.imageKey);
    return { buffer, contentType: 'image/png' };
  }

  // Reutilizado tanto por getPublicSummary() como por el renderizador de la
  // imagen (worker) — una sola fuente de verdad para "qué es seguro
  // compartir de esta lectura".
  async getSanitizedReadingData(
    readingId: string,
  ): Promise<SanitizedReadingData> {
    const reading = await this.prisma.reading.findUniqueOrThrow({
      where: { id: readingId },
      include: READING_WITH_DRAWS_INCLUDE,
    });

    if (isPalmService(reading.service.code)) {
      return {
        readingType: 'PALM',
        title: GENERIC_SHARE_TITLES.PALM,
        cards: null,
      };
    }

    const positions = new Map(
      reading.spread?.positions.map((p) => [p.code, p]) ?? [],
    );
    const cards = [...reading.draws]
      .sort(
        (a, b) =>
          (positions.get(a.position)?.orderIndex ?? 0) -
          (positions.get(b.position)?.orderIndex ?? 0),
      )
      .map((draw) => ({
        position: draw.position,
        positionLabel: positions.get(draw.position)?.label ?? draw.position,
        cardName: draw.card.name,
        arcana: draw.card.arcana,
        suit: draw.card.suit,
        orientation: draw.orientation,
      }));

    return { readingType: 'TAROT', title: GENERIC_SHARE_TITLES.TAROT, cards };
  }

  async markImageReady(shareLinkId: string, imageKey: string): Promise<void> {
    await this.prisma.shareLink.update({
      where: { id: shareLinkId },
      data: { imageKey, imageStatus: 'READY' },
    });
  }

  // Guardado condicional: si el enlace ya fue revocado o el job es un
  // reintento tardío que llega después de un éxito previo, no pisa un
  // READY ya alcanzado.
  async markImageFailed(shareLinkId: string): Promise<void> {
    await this.prisma.shareLink.updateMany({
      where: { id: shareLinkId, imageStatus: { not: 'READY' } },
      data: { imageStatus: 'FAILED' },
    });
  }

  // Se llama desde AuthService.register(). Un token inválido, revocado o
  // inexistente simplemente no atribuye nada — nunca lanza, para que jamás
  // pueda tumbar un registro real.
  async logSignupConversion(
    userId: string,
    referralToken: string | null,
  ): Promise<void> {
    if (!referralToken) {
      return;
    }
    const shareLink = await this.prisma.shareLink.findUnique({
      where: { id: referralToken },
    });
    if (!shareLink) {
      return;
    }
    await this.logEvent(
      ANALYTICS_EVENT_TYPES.SHARE_SIGNUP,
      shareLink.id,
      userId,
    );
  }

  private async findActiveShareLink(token: string): Promise<ShareLink> {
    const shareLink = await this.prisma.shareLink.findFirst({
      where: { id: token, revokedAt: null },
    });
    if (!shareLink) {
      throw new NotFoundException('Enlace no encontrado.');
    }

    const reading = await this.prisma.reading.findUnique({
      where: { id: shareLink.readingId },
    });
    if (!reading || reading.status !== 'COMPLETED') {
      throw new NotFoundException('Enlace no encontrado.');
    }

    return shareLink;
  }

  private toShareLinkCreated(shareLink: ShareLink): ShareLinkCreated {
    const appUrl = this.configService.get<string>('app.url');
    return {
      token: shareLink.id,
      url: `${appUrl}/r/${shareLink.id}`,
      imageStatus: shareLink.imageStatus,
    };
  }

  private async logEvent(
    type: AnalyticsEventType,
    shareLinkId: string | null,
    userId: string | null,
  ): Promise<void> {
    await this.prisma.analyticsEvent.create({
      data: { type, shareLinkId, userId },
    });
  }
}
