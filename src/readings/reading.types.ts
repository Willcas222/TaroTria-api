import type {
  AIExecution,
  ArcanaType,
  CardOrientation,
  MinorSuit,
  PalmImage,
  Reading,
  ReadingInput,
  ReadingStatus,
  Service,
  TarotCard,
  TarotDraw,
  TarotSpread,
  TarotSpreadPosition,
} from '@prisma/client';
import type { PalmReadingInterpretation } from '../ai/tasks/palm-reading-interpretation.schema';
import type { TarotInterpretation } from '../ai/tasks/tarot-interpretation.schema';

export type ReadingWithService = Reading & { service: Service };

export type ReadingWithDetail = Reading & {
  service: Service;
  spread: (TarotSpread & { positions: TarotSpreadPosition[] }) | null;
  input: ReadingInput | null;
  draws: (TarotDraw & { card: TarotCard })[];
  aiExecutions: AIExecution[];
  palmImages: PalmImage[];
};

export interface ReadingSummary {
  id: string;
  serviceCode: string;
  status: ReadingStatus;
  createdAt: Date;
  submittedAt: Date | null;
}

export interface ReadingDraw {
  position: string;
  orientation: CardOrientation;
  card: {
    code: string;
    name: string;
    arcana: ArcanaType;
    suit: MinorSuit | null;
  };
}

export interface PalmImageSummary {
  id: string;
  status: PalmImage['status'];
  validationError: string | null;
}

export interface ReadingShareSummary {
  token: string;
  url: string;
  imageStatus: string;
}

export interface ReadingDetail extends ReadingSummary {
  input: { formVersion: number; answers: unknown } | null;
  draws: ReadingDraw[];
  images: PalmImageSummary[];
  aiResult: TarotInterpretation | PalmReadingInterpretation | null;
  share: ReadingShareSummary | null;
}

export interface AdminReadingSummary {
  id: string;
  userId: string;
  userEmail: string;
  serviceCode: string;
  status: ReadingStatus;
  createdAt: Date;
  submittedAt: Date | null;
}

export interface PaginatedAdminReadings {
  items: AdminReadingSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export type ReadingWithServiceAndUser = Reading & {
  service: Service;
  user: { id: string; email: string };
};

export function toAdminReadingSummary(
  reading: ReadingWithServiceAndUser,
): AdminReadingSummary {
  return {
    id: reading.id,
    userId: reading.user.id,
    userEmail: reading.user.email,
    serviceCode: reading.service.code,
    status: reading.status,
    createdAt: reading.createdAt,
    submittedAt: reading.submittedAt,
  };
}

export function toReadingSummary(reading: ReadingWithService): ReadingSummary {
  return {
    id: reading.id,
    serviceCode: reading.service.code,
    status: reading.status,
    createdAt: reading.createdAt,
    submittedAt: reading.submittedAt,
  };
}

export function toReadingDetail(
  reading: ReadingWithDetail,
  share: ReadingShareSummary | null,
): ReadingDetail {
  const positionOrder = new Map(
    reading.spread?.positions.map((p) => [p.code, p.orderIndex]) ?? [],
  );

  return {
    ...toReadingSummary(reading),
    input: reading.input
      ? {
          formVersion: reading.input.formVersion,
          answers: reading.input.answers,
        }
      : null,
    draws: [...reading.draws]
      .sort(
        (a, b) =>
          (positionOrder.get(a.position) ?? 0) -
          (positionOrder.get(b.position) ?? 0),
      )
      .map((draw) => ({
        position: draw.position,
        orientation: draw.orientation,
        card: {
          code: draw.card.code,
          name: draw.card.name,
          arcana: draw.card.arcana,
          suit: draw.card.suit,
        },
      })),
    images: reading.palmImages.map((image) => ({
      id: image.id,
      status: image.status,
      validationError: image.validationError,
    })),
    aiResult:
      (reading.aiExecutions[0]?.outputJson as
        TarotInterpretation | PalmReadingInterpretation | undefined) ?? null,
    share,
  };
}
