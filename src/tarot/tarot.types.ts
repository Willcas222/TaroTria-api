import type { ArcanaType, MinorSuit, TarotCard } from '@prisma/client';

export interface TarotDeckCard {
  id: string;
  code: string;
  name: string;
  arcana: ArcanaType;
  suit: MinorSuit | null;
  numberInSuit: number | null;
  orderIndex: number;
  uprightMeaning: string;
  reversedMeaning: string;
  imageUrl: string | null;
}

export function toTarotDeckCard(card: TarotCard): TarotDeckCard {
  return {
    id: card.id,
    code: card.code,
    name: card.name,
    arcana: card.arcana,
    suit: card.suit,
    numberInSuit: card.numberInSuit,
    orderIndex: card.orderIndex,
    uprightMeaning: card.uprightMeaning,
    reversedMeaning: card.reversedMeaning,
    imageUrl: card.imageUrl,
  };
}
