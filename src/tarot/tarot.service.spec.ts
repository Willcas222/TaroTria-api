import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CacheService } from '../cache/cache.service';
import { PrismaService } from '../prisma/prisma.service';
import { tarotDeckCacheKey } from './tarot.constants';
import { TarotService } from './tarot.service';

describe('TarotService', () => {
  let service: TarotService;
  let cache: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
  let prisma: { tarotDeck: { findFirst: jest.Mock } };

  const deck = {
    id: 'deck-1',
    code: 'RIDER_WAITE_ES',
    name: 'Mazo clásico',
    isActive: true,
    cards: [
      {
        id: 'card-1',
        code: 'THE_FOOL',
        name: 'El Loco',
        arcana: 'MAJOR',
        suit: null,
        numberInSuit: null,
        orderIndex: 0,
        uprightMeaning: 'up',
        reversedMeaning: 'down',
        imageUrl: null,
      },
    ],
  };

  beforeEach(async () => {
    prisma = { tarotDeck: { findFirst: jest.fn() } };
    cache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };

    const module = await Test.createTestingModule({
      providers: [
        TarotService,
        { provide: PrismaService, useValue: prisma },
        { provide: CacheService, useValue: cache },
      ],
    }).compile();

    service = module.get(TarotService);
  });

  it('returns the cached deck without querying the database', async () => {
    cache.get.mockResolvedValue([{ code: 'THE_FOOL' }]);

    const result = await service.getActiveDeckCards('RIDER_WAITE_ES');

    expect(result).toEqual([{ code: 'THE_FOOL' }]);
    expect(prisma.tarotDeck.findFirst).not.toHaveBeenCalled();
  });

  it('queries the database and caches the result on a miss', async () => {
    prisma.tarotDeck.findFirst.mockResolvedValue(deck);

    const result = await service.getActiveDeckCards('RIDER_WAITE_ES');

    expect(result).toEqual([
      {
        id: 'card-1',
        code: 'THE_FOOL',
        name: 'El Loco',
        arcana: 'MAJOR',
        suit: null,
        numberInSuit: null,
        orderIndex: 0,
        uprightMeaning: 'up',
        reversedMeaning: 'down',
        imageUrl: null,
      },
    ]);
    expect(cache.set).toHaveBeenCalledWith(
      tarotDeckCacheKey('RIDER_WAITE_ES'),
      result,
      expect.any(Number),
    );
  });

  it('throws NotFoundException when the deck does not exist or is inactive', async () => {
    prisma.tarotDeck.findFirst.mockResolvedValue(null);

    await expect(service.getActiveDeckCards('UNKNOWN')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
