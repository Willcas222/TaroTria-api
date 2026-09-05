import type {
  ArcanaType,
  CardOrientation,
  MinorSuit,
  ShareImageStatus,
} from '@prisma/client';

export type SharedReadingType = 'TAROT' | 'PALM';

export interface SharedCardSummary {
  position: string;
  positionLabel: string;
  cardName: string;
  arcana: ArcanaType;
  suit: MinorSuit | null;
  orientation: CardOrientation;
}

// Datos estrictamente estructurales de una lectura, sin nada derivado de la
// pregunta privada del usuario (sección "resumen saneado" de la Fase 9) —
// esta es la única forma que puede llegar tanto al endpoint público como al
// renderizador de la imagen compartible.
export interface SanitizedReadingData {
  readingType: SharedReadingType;
  title: string;
  // null para lecturas de manos: no hay datos estructurales seguros para
  // compartir más allá del tipo de lectura (las imágenes reales nunca se
  // comparten, sección 11 y "Salida" de la Fase 9).
  cards: SharedCardSummary[] | null;
}

export interface SharedSummary extends SanitizedReadingData {
  disclaimer: string;
  imageStatus: ShareImageStatus;
  imageUrl: string | null;
}

export interface ShareLinkCreated {
  token: string;
  url: string;
  imageStatus: ShareImageStatus;
}
