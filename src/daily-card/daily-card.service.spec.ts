import { createHmac } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { CacheService } from '../cache/cache.service';
import { DEFAULT_TAROT_DECK_CODE } from '../tarot/tarot.constants';
import { TarotService } from '../tarot/tarot.service';
import { dailyCardCacheKey } from './daily-card.constants';
import { DailyCardService } from './daily-card.service';

const SECRET = 'test-only-daily-card-secret-please-change-32c';

function makeCard(code: string) {
  return {
    id: `id-${code}`,
    code,
    name: code,
    arcana: 'MAJOR' as const,
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

function expectedSelection(userId: string, date: string) {
  const digest = createHmac('sha256', SECRET)
    .update(`${userId}:${date}`)
    .digest();
  const card = DECK[digest.readUInt32BE(0) % DECK.length];
  const orientation = digest[4] % 2 === 0 ? 'UPRIGHT' : 'REVERSED';
  return { card, orientation };
}

describe('DailyCardService', () => {
  let service: DailyCardService;
  let cache: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
  let tarotService: { getActiveDeckCards: jest.Mock };
  let configService: { get: jest.Mock };

  beforeEach(async () => {
    cache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };
    tarotService = {
      getActiveDeckCards: jest.fn().mockResolvedValue(DECK),
    };
    configService = {
      get: jest.fn().mockReturnValue(SECRET),
    };

    const module = await Test.createTestingModule({
      providers: [
        DailyCardService,
        { provide: CacheService, useValue: cache },
        { provide: TarotService, useValue: tarotService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get(DailyCardService);
  });

  it('deterministically selects the card and orientation from the HMAC digest', async () => {
    const today = new Date('2026-09-03T12:00:00Z');
    const { card, orientation } = expectedSelection('user-1', '2026-09-03');

    const result = await service.getTodaysCard('user-1', today);

    expect(result.card.code).toBe(card.code);
    expect(result.orientation).toBe(orientation);
    expect(result.interpretation).toBe(
      orientation === 'UPRIGHT' ? card.uprightMeaning : card.reversedMeaning,
    );
    expect(result.date).toBe('2026-09-03');
    expect(result.disclaimer).toContain('fines de entretenimiento');
  });

  it('returns the same result for the same user on the same day without recomputing', async () => {
    const today = new Date('2026-09-03T08:00:00Z');

    const first = await service.getTodaysCard('user-1', today);
    expect(cache.set).toHaveBeenCalledWith(
      dailyCardCacheKey('user-1', '2026-09-03'),
      first,
      expect.any(Number),
    );

    cache.get.mockResolvedValue(first);
    const second = await service.getTodaysCard('user-1', today);

    expect(second).toEqual(first);
    expect(tarotService.getActiveDeckCards).toHaveBeenCalledTimes(1);
  });

  it('fetches the default tarot deck', async () => {
    await service.getTodaysCard('user-1', new Date('2026-09-03T00:00:00Z'));

    expect(tarotService.getActiveDeckCards).toHaveBeenCalledWith(
      DEFAULT_TAROT_DECK_CODE,
    );
  });
});
