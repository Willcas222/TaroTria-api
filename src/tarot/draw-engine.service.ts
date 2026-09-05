import { randomInt } from 'crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { CardOrientation } from '@prisma/client';
import type { TarotDeckCard } from './tarot.types';

export interface TarotDraw {
  position: string;
  card: TarotDeckCard;
  orientation: CardOrientation;
}

@Injectable()
export class DrawEngineService {
  draw(deck: TarotDeckCard[], positions: string[]): TarotDraw[] {
    if (positions.length === 0) {
      throw new BadRequestException(
        'La tirada no tiene posiciones configuradas.',
      );
    }
    if (positions.length > deck.length) {
      throw new BadRequestException(
        'El mazo no tiene suficientes cartas para esta tirada.',
      );
    }

    const pool = [...deck];
    const draws: TarotDraw[] = [];

    for (const position of positions) {
      const index = randomInt(pool.length);
      const [card] = pool.splice(index, 1);
      const orientation: CardOrientation =
        randomInt(2) === 0 ? 'UPRIGHT' : 'REVERSED';
      draws.push({ position, card, orientation });
    }

    return draws;
  }
}
