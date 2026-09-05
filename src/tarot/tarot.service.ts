import { Injectable, NotFoundException } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  TAROT_DECK_CACHE_TTL_SECONDS,
  tarotDeckCacheKey,
} from './tarot.constants';
import { toTarotDeckCard, type TarotDeckCard } from './tarot.types';

@Injectable()
export class TarotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async getActiveDeckCards(deckCode: string): Promise<TarotDeckCard[]> {
    const cacheKey = tarotDeckCacheKey(deckCode);
    const cached = await this.cache.get<TarotDeckCard[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const deck = await this.prisma.tarotDeck.findFirst({
      where: { code: deckCode, isActive: true },
      include: { cards: { orderBy: { orderIndex: 'asc' } } },
    });

    if (!deck) {
      throw new NotFoundException('Mazo de tarot no encontrado.');
    }

    const cards = deck.cards.map(toTarotDeckCard);
    await this.cache.set(cacheKey, cards, TAROT_DECK_CACHE_TTL_SECONDS);
    return cards;
  }
}
