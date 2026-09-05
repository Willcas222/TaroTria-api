process.env.DATABASE_URL =
  process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { TAROT_SPREADS } from '../../prisma/seed-data/tarot-spreads';

const databaseUrl = process.env.DATABASE_URL as string;
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

async function seedSpreads() {
  for (const spread of TAROT_SPREADS) {
    const upserted = await prisma.tarotSpread.upsert({
      where: { code: spread.code },
      update: { name: spread.name },
      create: { code: spread.code, name: spread.name },
    });

    for (const position of spread.positions) {
      await prisma.tarotSpreadPosition.upsert({
        where: {
          spreadId_code: { spreadId: upserted.id, code: position.code },
        },
        update: { label: position.label, orderIndex: position.orderIndex },
        create: {
          spreadId: upserted.id,
          code: position.code,
          label: position.label,
          orderIndex: position.orderIndex,
        },
      });
    }
  }
}

describe('Tarot spreads seed (integration, isolated database)', () => {
  beforeAll(async () => {
    await prisma.tarotSpread.deleteMany();
    await seedSpreads();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('seeds the TAROT_THREE spread with its three ordered positions', async () => {
    const spread = await prisma.tarotSpread.findUniqueOrThrow({
      where: { code: 'TAROT_THREE' },
      include: { positions: { orderBy: { orderIndex: 'asc' } } },
    });

    expect(spread.name).toBe('Pasado, presente y tendencia');
    expect(spread.positions.map((p) => p.code)).toEqual([
      'PAST',
      'PRESENT',
      'TREND',
    ]);
  });

  it('enforces a unique position code within the same spread', async () => {
    const spread = await prisma.tarotSpread.findUniqueOrThrow({
      where: { code: 'TAROT_THREE' },
    });

    await expect(
      prisma.tarotSpreadPosition.create({
        data: {
          spreadId: spread.id,
          code: 'PAST',
          label: 'Duplicado',
          orderIndex: 999,
        },
      }),
    ).rejects.toThrow();
  });

  it('re-seeding is idempotent: no duplicate rows are created', async () => {
    await seedSpreads();
    await seedSpreads();

    const spreads = await prisma.tarotSpread.count();
    const positions = await prisma.tarotSpreadPosition.count();

    expect(spreads).toBe(1);
    expect(positions).toBe(3);
  });
});
