import type { ArcanaType, MinorSuit } from '@prisma/client';

export type CardOrientation = 'UPRIGHT' | 'REVERSED';

export interface DailyCardResult {
  date: string;
  card: {
    code: string;
    name: string;
    arcana: ArcanaType;
    suit: MinorSuit | null;
  };
  orientation: CardOrientation;
  interpretation: string;
  disclaimer: string;
}
