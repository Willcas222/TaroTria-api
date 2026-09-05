jest.mock('crypto', () => {
  const actual = jest.requireActual('crypto');
  return { ...actual, randomInt: jest.fn(actual.randomInt) };
});

import { randomInt } from 'crypto';
import { BadRequestException } from '@nestjs/common';
import { DrawEngineService } from './draw-engine.service';
import type { TarotDeckCard } from './tarot.types';

const randomIntMock = randomInt as unknown as jest.Mock;

function makeCard(code: string): TarotDeckCard {
  return {
    id: `id-${code}`,
    code,
    name: code,
    arcana: 'MAJOR',
    suit: null,
    numberInSuit: null,
    orderIndex: 0,
    uprightMeaning: `${code}-up`,
    reversedMeaning: `${code}-down`,
    imageUrl: null,
  };
}

const DECK = [
  makeCard('THE_FOOL'),
  makeCard('THE_MAGICIAN'),
  makeCard('THE_HIGH_PRIESTESS'),
  makeCard('THE_EMPRESS'),
  makeCard('THE_EMPEROR'),
];

describe('DrawEngineService', () => {
  let service: DrawEngineService;

  beforeEach(() => {
    service = new DrawEngineService();
    randomIntMock.mockClear();
    randomIntMock.mockImplementation((...args: Parameters<typeof randomInt>) =>
      jest.requireActual('crypto').randomInt(...args),
    );
  });

  it('throws BadRequestException when there are no positions', () => {
    expect(() => service.draw(DECK, [])).toThrow(BadRequestException);
  });

  it('throws BadRequestException when there are more positions than cards in the deck', () => {
    const positions = DECK.map((_, i) => `POS_${i}`).concat('POS_EXTRA');
    expect(() => service.draw(DECK, positions)).toThrow(BadRequestException);
  });

  it('returns one draw per position, in the given order', () => {
    const draws = service.draw(DECK, ['PAST', 'PRESENT', 'TREND']);

    expect(draws).toHaveLength(3);
    expect(draws.map((d) => d.position)).toEqual(['PAST', 'PRESENT', 'TREND']);
  });

  it('never repeats a card across positions, using real crypto randomness', () => {
    for (let i = 0; i < 50; i += 1) {
      const draws = service.draw(DECK, ['PAST', 'PRESENT', 'TREND']);
      const codes = draws.map((d) => d.card.code);
      expect(new Set(codes).size).toBe(codes.length);
    }
  });

  it('selects the card by index and the orientation from randomInt, in that order', () => {
    // First call picks the card index (pool size 5 -> index 2 -> THE_HIGH_PRIESTESS),
    // second call picks the orientation (0 -> UPRIGHT).
    randomIntMock.mockReturnValueOnce(2).mockReturnValueOnce(0);

    const [draw] = service.draw(DECK, ['PAST']);

    expect(draw.card.code).toBe('THE_HIGH_PRIESTESS');
    expect(draw.orientation).toBe('UPRIGHT');
  });

  it('maps a non-zero orientation roll to REVERSED', () => {
    randomIntMock.mockReturnValueOnce(0).mockReturnValueOnce(1);

    const [draw] = service.draw(DECK, ['PAST']);

    expect(draw.orientation).toBe('REVERSED');
  });

  it('shrinks the pool so a removed card cannot be drawn again', () => {
    // Pool starts at 5 cards (index 4 -> THE_EMPEROR removed), then 4 left
    // (index 0 -> THE_FOOL removed).
    randomIntMock
      .mockReturnValueOnce(4) // card for PAST
      .mockReturnValueOnce(0) // orientation for PAST
      .mockReturnValueOnce(0) // card for PRESENT
      .mockReturnValueOnce(0); // orientation for PRESENT

    const draws = service.draw(DECK, ['PAST', 'PRESENT']);

    expect(draws[0].card.code).toBe('THE_EMPEROR');
    expect(draws[1].card.code).toBe('THE_FOOL');
  });
});
