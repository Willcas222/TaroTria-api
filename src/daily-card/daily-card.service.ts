import { createHmac } from 'crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../cache/cache.service';
import { PrismaService } from '../prisma/prisma.service';
import { RewardsService } from '../rewards/rewards.service';
import { DEFAULT_TAROT_DECK_CODE } from '../tarot/tarot.constants';
import { TarotService } from '../tarot/tarot.service';
import {
  DAILY_CARD_CACHE_TTL_SECONDS,
  DAILY_CARD_DISCLAIMER,
  DAILY_CARD_FREE_DAYS,
  dailyCardCacheKey,
} from './daily-card.constants';
import type {
  CardOrientation,
  DailyCardResponse,
} from './daily-card.types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class DailyCardService {
  constructor(
    private readonly configService: ConfigService,
    private readonly cache: CacheService,
    private readonly tarotService: TarotService,
    private readonly prisma: PrismaService,
    private readonly rewardsService: RewardsService,
  ) {}

  async getTodaysCard(
    userId: string,
    today: Date = new Date(),
  ): Promise<DailyCardResponse> {
    const date = today.toISOString().slice(0, 10);
    const cacheKey = dailyCardCacheKey(userId, date);

    const cached = await this.cache.get<DailyCardResponse>(cacheKey);
    if (cached) {
      return cached;
    }

    const isWithinFreeWindow = await this.isWithinFreeWindow(userId, today);
    if (!isWithinFreeWindow) {
      // Atómico: solo consume el desbloqueo si de verdad sigue disponible en
      // este instante (evita que dos requests concurrentes usen el mismo
      // desbloqueo dos veces). Mañana vuelve a requerir un anuncio nuevo.
      const unlockedNow = await this.rewardsService.tryConsumeUnlock(
        userId,
        'DAILY_CARD_UNLOCK',
      );
      if (!unlockedNow) {
        const progress = await this.rewardsService.getProgress(
          userId,
          'DAILY_CARD_UNLOCK',
        );
        // No se cachea: no es un resultado, es un estado de acceso que
        // cambia en cuanto el usuario complete el anuncio.
        return { locked: true, requiredAds: progress.requiredCount };
      }
    }

    const result = await this.buildTodaysCard(userId, date);
    await this.cache.set(cacheKey, result, DAILY_CARD_CACHE_TTL_SECONDS);
    return result;
  }

  private async isWithinFreeWindow(
    userId: string,
    today: Date,
  ): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { createdAt: true },
    });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado.');
    }

    const daysSinceRegistration =
      Math.floor((today.getTime() - user.createdAt.getTime()) / MS_PER_DAY) +
      1;
    return daysSinceRegistration <= DAILY_CARD_FREE_DAYS;
  }

  private async buildTodaysCard(userId: string, date: string) {
    const cards = await this.tarotService.getActiveDeckCards(
      DEFAULT_TAROT_DECK_CODE,
    );

    const secret = this.configService.get<string>(
      'DAILY_CARD_SECRET',
    ) as string;
    const digest = createHmac('sha256', secret)
      .update(`${userId}:${date}`)
      .digest();

    const cardIndex = digest.readUInt32BE(0) % cards.length;
    const orientation: CardOrientation =
      digest[4] % 2 === 0 ? 'UPRIGHT' : 'REVERSED';
    const card = cards[cardIndex];

    return {
      locked: false as const,
      date,
      card: {
        code: card.code,
        name: card.name,
        arcana: card.arcana,
        suit: card.suit,
      },
      orientation,
      interpretation:
        orientation === 'UPRIGHT' ? card.uprightMeaning : card.reversedMeaning,
      disclaimer: DAILY_CARD_DISCLAIMER,
    };
  }
}
