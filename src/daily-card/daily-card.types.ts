import type { ArcanaType, MinorSuit } from '@prisma/client';

export type CardOrientation = 'UPRIGHT' | 'REVERSED';

export interface DailyCardResult {
  locked: false;
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

// A partir del día 6 de la cuenta (sección 2 del modelo de negocio), la
// carta gratis requiere ver un anuncio recompensado primero.
export interface DailyCardLockedResult {
  locked: true;
  requiredAds: number;
}

export type DailyCardResponse = DailyCardResult | DailyCardLockedResult;
