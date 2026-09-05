import { createHmac } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../cache/cache.service';
import { DEFAULT_TAROT_DECK_CODE } from '../tarot/tarot.constants';
import { TarotService } from '../tarot/tarot.service';
import {
  DAILY_CARD_CACHE_TTL_SECONDS,
  DAILY_CARD_DISCLAIMER,
  dailyCardCacheKey,
} from './daily-card.constants';
import type { CardOrientation, DailyCardResult } from './daily-card.types';

@Injectable()
export class DailyCardService {
  constructor(
    private readonly configService: ConfigService,
    private readonly cache: CacheService,
    private readonly tarotService: TarotService,
  ) {}

  async getTodaysCard(
    userId: string,
    today: Date = new Date(),
  ): Promise<DailyCardResult> {
    const date = today.toISOString().slice(0, 10);
    const cacheKey = dailyCardCacheKey(userId, date);

    const cached = await this.cache.get<DailyCardResult>(cacheKey);
    if (cached) {
      return cached;
    }

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

    const result: DailyCardResult = {
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

    await this.cache.set(cacheKey, result, DAILY_CARD_CACHE_TTL_SECONDS);
    return result;
  }
}
