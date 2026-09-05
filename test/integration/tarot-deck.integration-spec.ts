process.env.DATABASE_URL =
  process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import {
  TAROT_CARDS,
  TAROT_DECK_CODE,
  TAROT_DECK_NAME,
} from '../../prisma/seed-data/tarot-cards';

const databaseUrl = process.env.DATABASE_URL as string;
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

async function seedDeck() {
  const deck = await prisma.tarotDeck.upsert({
    where: { code: TAROT_DECK_CODE },
    update: { name: TAROT_DECK_NAME },
    create: { code: TAROT_DECK_CODE, name: TAROT_DECK_NAME },
  });

  for (const card of TAROT_CARDS) {
    await prisma.tarotCard.upsert({
      where: { deckId_code: { deckId: deck.id, code: card.code } },
      update: card,
      create: { ...card, deckId: deck.id },
    });
  }

  return deck;
}

describe('Tarot deck seed (integration, isolated database)', () => {
  beforeAll(async () => {
    await prisma.tarotDeck.deleteMany();
    await seedDeck();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('seeds exactly 78 cards: 22 major and 56 minor arcana', async () => {
    const total = await prisma.tarotCard.count();
    const major = await prisma.tarotCard.count({ where: { arcana: 'MAJOR' } });
    const minor = await prisma.tarotCard.count({ where: { arcana: 'MINOR' } });

    expect(total).toBe(78);
    expect(major).toBe(22);
    expect(minor).toBe(56);
  });

  it('gives every minor suit exactly 14 cards', async () => {
    for (const suit of ['WANDS', 'CUPS', 'SWORDS', 'PENTACLES'] as const) {
      const count = await prisma.tarotCard.count({ where: { suit } });
      expect(count).toBe(14);
    }
  });

  it('never leaves a card without upright or reversed meaning', async () => {
    const cards = await prisma.tarotCard.findMany({
      select: { code: true, uprightMeaning: true, reversedMeaning: true },
    });

    for (const card of cards) {
      expect(card.uprightMeaning.length).toBeGreaterThan(0);
      expect(card.reversedMeaning.length).toBeGreaterThan(0);
    }
  });

  it('covers a contiguous orderIndex range from 0 to 77 with no gaps or repeats', async () => {
    const cards = await prisma.tarotCard.findMany({
      select: { orderIndex: true },
      orderBy: { orderIndex: 'asc' },
    });

    const indexes = cards.map((c) => c.orderIndex);
    expect(indexes).toEqual(Array.from({ length: 78 }, (_, i) => i));
  });

  it('enforces a unique card code within the same deck', async () => {
    const deck = await prisma.tarotDeck.findUniqueOrThrow({
      where: { code: TAROT_DECK_CODE },
    });

    await expect(
      prisma.tarotCard.create({
        data: {
          deckId: deck.id,
          code: 'THE_FOOL',
          name: 'Duplicado',
          arcana: 'MAJOR',
          orderIndex: 999,
          uprightMeaning: 'x',
          reversedMeaning: 'x',
        },
      }),
    ).rejects.toThrow();
  });

  it('re-seeding is idempotent: no duplicate rows are created', async () => {
    await seedDeck();
    await seedDeck();

    const total = await prisma.tarotCard.count();
    const decks = await prisma.tarotDeck.count();

    expect(total).toBe(78);
    expect(decks).toBe(1);
  });
});
