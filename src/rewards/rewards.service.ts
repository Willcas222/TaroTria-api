import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type RewardType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AdCallbackVerifier } from './ad-callback-verifier.interface';
import { AD_CALLBACK_VERIFIERS } from './ad-callback-verifier.interface';
import {
  FLASH_OFFER_DAILY_LIMIT,
  REWARD_ADS_REQUIRED,
  REWARD_SESSION_TTL_SECONDS,
} from './rewards.constants';
import {
  REWARD_ANALYTICS_EVENTS,
  toRewardSessionSummary,
  type RewardProgressSummary,
  type RewardSessionSummary,
} from './rewards.types';

export interface ProcessCallbackResult {
  granted: boolean;
  reason?: string;
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

@Injectable()
export class RewardsService {
  private readonly verifiersByProvider: Map<string, AdCallbackVerifier>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Inject(AD_CALLBACK_VERIFIERS) verifiers: AdCallbackVerifier[],
  ) {
    this.verifiersByProvider = new Map(
      verifiers.map((verifier) => [verifier.providerName, verifier]),
    );
  }

  // El proveedor "por defecto" hoy es siempre el stub -- el día que exista
  // una cuenta real, esto se resuelve por configuración (ej. una variable
  // REWARDS_PROVIDER) sin tocar el resto del servicio.
  private get defaultProvider(): string {
    return 'stub';
  }

  async createSession(
    userId: string,
    rewardType: RewardType,
  ): Promise<RewardSessionSummary> {
    if (rewardType === 'FLASH_OFFER_UNLOCK') {
      await this.assertFlashOfferDailyLimitNotExceeded(userId);
    }

    const expiresAt = new Date(Date.now() + REWARD_SESSION_TTL_SECONDS * 1000);

    const session = await this.prisma.rewardSession.create({
      data: {
        userId,
        rewardType,
        provider: this.defaultProvider,
        idempotencyKey: randomUUID(),
        expiresAt,
      },
    });

    await this.logEvent(REWARD_ANALYTICS_EVENTS.AD_REQUESTED, userId, {
      rewardType,
      provider: session.provider,
      sessionId: session.id,
    });

    return toRewardSessionSummary(session);
  }

  async getProgress(
    userId: string,
    rewardType: RewardType,
  ): Promise<RewardProgressSummary> {
    const progress = await this.prisma.rewardProgress.findUnique({
      where: { userId_rewardType: { userId, rewardType } },
    });
    const requiredCount = REWARD_ADS_REQUIRED[rewardType];
    const currentCount = progress?.currentCount ?? 0;

    return {
      rewardType,
      currentCount,
      requiredCount,
      unlocked: currentCount >= requiredCount,
    };
  }

  // Intenta consumir un desbloqueo ya ganado (ej. DailyCardService entregando
  // la carta gratis, o ReadingsService saltándose el cobro de créditos).
  // Atómico y seguro ante condiciones de carrera: la condición
  // `currentCount >= requiredCount` se evalúa en la misma actualización que
  // resetea el contador, así que dos requests concurrentes nunca pueden
  // consumir el mismo desbloqueo dos veces (a diferencia de leer el progreso
  // y resetear en dos pasos separados). Acepta un `tx` opcional para que el
  // llamador pueda incluirlo en su propia transacción (ej. junto con la
  // reserva de créditos) y así nunca cobrar de más ni de menos si algo falla
  // a la mitad.
  async tryConsumeUnlock(
    userId: string,
    rewardType: RewardType,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const client = tx ?? this.prisma;
    const requiredCount = REWARD_ADS_REQUIRED[rewardType];

    const result = await client.rewardProgress.updateMany({
      where: { userId, rewardType, currentCount: { gte: requiredCount } },
      data: { currentCount: 0 },
    });

    return result.count > 0;
  }

  // Punto de entrada único para cualquier callback de un proveedor de
  // anuncios (sección 5: "el backend debe validar la sesión de recompensa").
  // `rawParams` son los parámetros crudos que mande el proveedor -- cada
  // verifier sabe cómo leerlos y validar su propia firma.
  async processProviderCallback(
    providerName: string,
    rawParams: Record<string, string>,
  ): Promise<ProcessCallbackResult> {
    const verifier = this.verifiersByProvider.get(providerName);
    if (!verifier) {
      throw new NotFoundException(
        `No hay un proveedor de anuncios registrado como "${providerName}".`,
      );
    }

    const verified = verifier.verify(rawParams);
    return this.registerCompletedSession(
      verified.externalSessionId,
      providerName,
    );
  }

  // Solo para desarrollo/pruebas: simula, desde dentro de nuestro propio
  // backend, el callback server-to-server que un proveedor real mandaría
  // cuando el usuario termina un anuncio de verdad. El secreto del stub
  // nunca sale al navegador -- esto llama exactamente al mismo
  // processProviderCallback que usaría un proveedor real, solo que el
  // secreto lo lee del entorno del servidor en vez de venir por HTTP
  // externo. No existe en producción.
  async simulateStubCompletion(
    userId: string,
    sessionId: string,
  ): Promise<ProcessCallbackResult> {
    if (this.configService.get<string>('NODE_ENV') === 'production') {
      throw new NotFoundException();
    }

    const session = await this.prisma.rewardSession.findUnique({
      where: { id: sessionId },
    });
    if (!session || session.userId !== userId) {
      throw new ForbiddenException('Esta sesión de recompensa no es tuya.');
    }

    const secret = this.configService.get<string>('REWARDS_STUB_SECRET');
    return this.processProviderCallback('stub', {
      sessionId,
      secret: secret as string,
    });
  }

  private async registerCompletedSession(
    sessionId: string,
    provider: string,
  ): Promise<ProcessCallbackResult> {
    const session = await this.prisma.rewardSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return { granted: false, reason: 'session_not_found' };
    }

    if (session.status === 'COMPLETED') {
      // Callback duplicado (reintento del proveedor) de una sesión que ya
      // otorgó su recompensa -- no es un error, pero tampoco se vuelve a
      // otorgar nada.
      return { granted: false, reason: 'already_completed' };
    }

    if (session.status !== 'CREATED' && session.status !== 'STARTED') {
      await this.logEvent(
        REWARD_ANALYTICS_EVENTS.REWARD_REJECTED,
        session.userId,
        { rewardType: session.rewardType, sessionId, reason: session.status },
      );
      return { granted: false, reason: 'session_not_reusable' };
    }

    if (session.expiresAt.getTime() < Date.now()) {
      await this.prisma.rewardSession.updateMany({
        where: { id: sessionId, status: { in: ['CREATED', 'STARTED'] } },
        data: { status: 'EXPIRED' },
      });
      await this.logEvent(
        REWARD_ANALYTICS_EVENTS.REWARD_SESSION_EXPIRED,
        session.userId,
        { rewardType: session.rewardType, sessionId },
      );
      return { granted: false, reason: 'session_expired' };
    }

    try {
      const wasCompletedHere = await this.prisma.$transaction(async (tx) => {
        // Actualización atómica condicionada al estado: si dos callbacks
        // concurrentes llegan para la misma sesión, solo uno de los dos
        // logra pasar de CREATED/STARTED a COMPLETED aquí -- el otro ve
        // count=0 y sabe que llegó tarde, sin necesidad de un lock explícito.
        const updated = await tx.rewardSession.updateMany({
          where: { id: sessionId, status: { in: ['CREATED', 'STARTED'] } },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
        if (updated.count === 0) {
          return false;
        }

        await tx.rewardTransaction.create({
          data: {
            userId: session.userId,
            rewardSessionId: session.id,
            rewardType: session.rewardType,
            rewardAmount: 1,
            provider,
          },
        });

        await tx.rewardProgress.upsert({
          where: {
            userId_rewardType: {
              userId: session.userId,
              rewardType: session.rewardType,
            },
          },
          create: {
            userId: session.userId,
            rewardType: session.rewardType,
            currentCount: 1,
          },
          update: { currentCount: { increment: 1 } },
        });

        return true;
      });

      if (!wasCompletedHere) {
        return { granted: false, reason: 'already_completed' };
      }
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        return { granted: false, reason: 'already_completed' };
      }
      throw error;
    }

    await this.logEvent(REWARD_ANALYTICS_EVENTS.AD_COMPLETED, session.userId, {
      rewardType: session.rewardType,
      sessionId,
      provider,
    });
    await this.logEvent(
      REWARD_ANALYTICS_EVENTS.REWARD_GRANTED,
      session.userId,
      { rewardType: session.rewardType, sessionId, provider },
    );

    return { granted: true };
  }

  private async logEvent(
    type: string,
    userId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.analyticsEvent.create({
      data: { type, userId, metadata: metadata as Prisma.InputJsonValue },
    });
  }

  // Sección 10 del modelo de negocio: "máximo 1 compra promocional por
  // usuario por día". Cada ciclo de desbloqueo de oferta flash consume
  // exactamente FLASH_OFFER_ADS_REQUIRED transacciones -- contar cuántas se
  // completaron hoy y dividir dice cuántos ciclos ya se ganaron hoy.
  private async assertFlashOfferDailyLimitNotExceeded(
    userId: string,
  ): Promise<void> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const completedToday = await this.prisma.rewardTransaction.count({
      where: {
        userId,
        rewardType: 'FLASH_OFFER_UNLOCK',
        createdAt: { gte: startOfDay },
      },
    });

    const requiredPerUnlock = REWARD_ADS_REQUIRED.FLASH_OFFER_UNLOCK;
    const unlocksEarnedToday = Math.floor(completedToday / requiredPerUnlock);

    if (unlocksEarnedToday >= FLASH_OFFER_DAILY_LIMIT) {
      throw new BadRequestException(
        'Ya alcanzaste el límite diario de ofertas flash. Vuelve mañana.',
      );
    }
  }
}
