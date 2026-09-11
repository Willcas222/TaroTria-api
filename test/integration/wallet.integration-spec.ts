process.env.DATABASE_URL =
  process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;
process.env.REDIS_URL = process.env.REDIS_URL_TEST ?? process.env.REDIS_URL;

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { AppModule } from '../../src/app.module';
import { CacheService } from '../../src/cache/cache.service';
import {
  TAROT_CARDS,
  TAROT_DECK_CODE,
  TAROT_DECK_NAME,
} from '../../prisma/seed-data/tarot-cards';
import { TAROT_SPREADS } from '../../prisma/seed-data/tarot-spreads';
import { READING_PROCESSING_QUEUE } from '../../src/queues/queues.module';
import { tarotDeckCacheKey } from '../../src/tarot/tarot.constants';
import { WalletService } from '../../src/wallet/wallet.service';

const databaseUrl = process.env.DATABASE_URL as string;
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

const TAROT_THREE_FORM_SCHEMA = {
  fields: [
    {
      key: 'question',
      type: 'textarea',
      label: '¿Qué quieres consultar?',
      required: true,
      minLength: 5,
      maxLength: 500,
    },
  ],
};

async function ensureRole(code: string, name: string) {
  return prisma.role.upsert({
    where: { code },
    update: {},
    create: { code, name },
  });
}

async function seedTarotThreeService(creditCost = 10) {
  const service = await prisma.service.upsert({
    where: { code: 'TAROT_THREE' },
    update: { isActive: true, creditCost },
    create: {
      code: 'TAROT_THREE',
      name: 'Tarot de tres cartas',
      description: 'Pasado, presente y tendencia.',
      creditCost,
    },
  });
  await prisma.serviceForm.deleteMany({ where: { serviceId: service.id } });
  await prisma.serviceForm.create({
    data: {
      serviceId: service.id,
      version: 1,
      schema: TAROT_THREE_FORM_SCHEMA,
      isActive: true,
    },
  });
  return service;
}

async function seedTarotDeck() {
  const deck = await prisma.tarotDeck.upsert({
    where: { code: TAROT_DECK_CODE },
    update: { name: TAROT_DECK_NAME, isActive: true },
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

async function seedTarotSpreads() {
  for (const spread of TAROT_SPREADS) {
    const upserted = await prisma.tarotSpread.upsert({
      where: { code: spread.code },
      update: { name: spread.name, isActive: true },
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

async function registerAndCompleteForm(
  app: INestApplication,
  email: string,
): Promise<{ cookie: string; readingId: string }> {
  const registerRes = await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send({ name: 'Wallet Test', email, password: 'supersecret123' })
    .expect(201);
  const cookie = (registerRes.headers['set-cookie'] as unknown as string[])
    .map((c) => c.split(';')[0])
    .join('; ');

  const createRes = await request(app.getHttpServer())
    .post('/api/v1/readings')
    .set('Cookie', cookie)
    .send({ serviceCode: 'TAROT_THREE' })
    .expect(201);
  const readingId = createRes.body.reading.id as string;

  await request(app.getHttpServer())
    .patch(`/api/v1/readings/${readingId}/inputs`)
    .set('Cookie', cookie)
    .send({ answers: { question: '¿Qué me depara el futuro?' } })
    .expect(200);

  return { cookie, readingId };
}

describe('Wallet and credit reservations (integration, isolated database)', () => {
  let app: INestApplication;
  let cacheService: CacheService;
  let walletService: WalletService;
  let readingQueue: Queue;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    cacheService = moduleRef.get(CacheService);
    walletService = moduleRef.get(WalletService);
    readingQueue = moduleRef.get(getQueueToken(READING_PROCESSING_QUEUE));

    await ensureRole('USER', 'Usuario');
    await seedTarotDeck();
    await seedTarotSpreads();
  });

  beforeEach(async () => {
    await prisma.reading.deleteMany();
    await prisma.user.deleteMany();
    await seedTarotThreeService(10);
    await cacheService.del(tarotDeckCacheKey(TAROT_DECK_CODE));
  });

  afterAll(async () => {
    await readingQueue.obliterate({ force: true });
    await app.close();
    await prisma.$disconnect();
  });

  it('grants the configured bonus as a real, auditable ledger entry on register', async () => {
    const email = `bonus-${Date.now()}@example.com`;
    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'Bonus Test', email, password: 'supersecret123' })
      .expect(201);
    const cookie = (registerRes.headers['set-cookie'] as unknown as string[])
      .map((c) => c.split(';')[0])
      .join('; ');

    const walletRes = await request(app.getHttpServer())
      .get('/api/v1/wallet')
      .set('Cookie', cookie)
      .expect(200);
    expect(walletRes.body.wallet.balance).toBe(10);

    const txRes = await request(app.getHttpServer())
      .get('/api/v1/wallet/transactions')
      .set('Cookie', cookie)
      .expect(200);
    expect(txRes.body.items).toHaveLength(1);
    expect(txRes.body.items[0]).toMatchObject({
      type: 'BONUS',
      amount: 10,
      balanceAfter: 10,
    });
  });

  it('reserves credits atomically on submit and exposes the reservation in the ledger', async () => {
    const { cookie, readingId } = await registerAndCompleteForm(
      app,
      `reserve-${Date.now()}@example.com`,
    );

    const submitRes = await request(app.getHttpServer())
      .post(`/api/v1/readings/${readingId}/submit`)
      .set('Cookie', cookie)
      .expect(200);
    expect(submitRes.body.reading.status).toBe('PENDING');

    const walletRes = await request(app.getHttpServer())
      .get('/api/v1/wallet')
      .set('Cookie', cookie)
      .expect(200);
    expect(walletRes.body.wallet.balance).toBe(0);

    const txRes = await request(app.getHttpServer())
      .get('/api/v1/wallet/transactions')
      .set('Cookie', cookie)
      .expect(200);
    expect(txRes.body.items[0]).toMatchObject({
      type: 'RESERVATION',
      amount: -10,
      balanceAfter: 0,
      readingId,
    });
  });

  it('rejects submit with 400 and reserves nothing when the balance is insufficient', async () => {
    await seedTarotThreeService(9999);
    const { cookie, readingId } = await registerAndCompleteForm(
      app,
      `insufficient-${Date.now()}@example.com`,
    );

    await request(app.getHttpServer())
      .post(`/api/v1/readings/${readingId}/submit`)
      .set('Cookie', cookie)
      .expect(400);

    const walletRes = await request(app.getHttpServer())
      .get('/api/v1/wallet')
      .set('Cookie', cookie)
      .expect(200);
    expect(walletRes.body.wallet.balance).toBe(10);

    const reading = await prisma.reading.findUnique({
      where: { id: readingId },
    });
    expect(reading?.status).toBe('DRAFT');
    const draws = await prisma.tarotDraw.count({ where: { readingId } });
    expect(draws).toBe(0);
  });

  it('never lets two concurrent submits for the same reading double-charge or double-draw, and never drives the balance negative', async () => {
    const { cookie, readingId } = await registerAndCompleteForm(
      app,
      `concurrent-${Date.now()}@example.com`,
    );

    const [first, second] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/v1/readings/${readingId}/submit`)
        .set('Cookie', cookie),
      request(app.getHttpServer())
        .post(`/api/v1/readings/${readingId}/submit`)
        .set('Cookie', cookie),
    ]);

    // Exactamente una de las dos solicitudes concurrentes debe ganar la
    // reserva real (200); la otra debe fallar de forma segura (400,
    // "saldo insuficiente" o "ya fue enviada" según qué tan cerca corrieron)
    // — nunca ambas con 200.
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 400]);

    const wallet = await prisma.wallet.findFirstOrThrow({
      where: { transactions: { some: { readingId } } },
    });
    expect(wallet.balance).toBe(0);
    expect(wallet.balance).toBeGreaterThanOrEqual(0);

    const reservations = await prisma.creditReservation.count({
      where: { readingId },
    });
    expect(reservations).toBe(1);

    const draws = await prisma.tarotDraw.count({ where: { readingId } });
    expect(draws).toBe(3);

    const reservationTransactions = await prisma.walletTransaction.count({
      where: { readingId, type: 'RESERVATION' },
    });
    expect(reservationTransactions).toBe(1);
  });

  it('releases the reservation and credits the wallet back when a reading fails definitively', async () => {
    const { cookie, readingId } = await registerAndCompleteForm(
      app,
      `release-${Date.now()}@example.com`,
    );

    await request(app.getHttpServer())
      .post(`/api/v1/readings/${readingId}/submit`)
      .set('Cookie', cookie)
      .expect(200);

    let walletRes = await request(app.getHttpServer())
      .get('/api/v1/wallet')
      .set('Cookie', cookie)
      .expect(200);
    expect(walletRes.body.wallet.balance).toBe(0);

    // Sin worker corriendo en esta suite, simulamos lo que
    // TarotReadingProcessor haría en un fallo definitivo real.
    await walletService.releaseReservation(readingId);

    walletRes = await request(app.getHttpServer())
      .get('/api/v1/wallet')
      .set('Cookie', cookie)
      .expect(200);
    expect(walletRes.body.wallet.balance).toBe(10);

    const txRes = await request(app.getHttpServer())
      .get('/api/v1/wallet/transactions')
      .set('Cookie', cookie)
      .expect(200);
    expect(txRes.body.items[0]).toMatchObject({
      type: 'RELEASE',
      amount: 10,
      balanceAfter: 10,
      readingId,
    });

    // Idempotente: llamarlo de nuevo (reintento del worker, evento
    // duplicado) no debe volver a acreditar.
    await walletService.releaseReservation(readingId);
    walletRes = await request(app.getHttpServer())
      .get('/api/v1/wallet')
      .set('Cookie', cookie)
      .expect(200);
    expect(walletRes.body.wallet.balance).toBe(10);
  });
});
