process.env.DATABASE_URL =
  process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;
process.env.REDIS_URL = process.env.REDIS_URL_TEST ?? process.env.REDIS_URL;

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import * as argon2 from '@node-rs/argon2';
import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { AppModule } from '../../src/app.module';
import { AuthService, type AuthTokens } from '../../src/auth/auth.service';
import { CacheService } from '../../src/cache/cache.service';
import {
  TAROT_CARDS,
  TAROT_DECK_CODE,
  TAROT_DECK_NAME,
} from '../../prisma/seed-data/tarot-cards';
import { TAROT_SPREADS } from '../../prisma/seed-data/tarot-spreads';
import { tarotProcessingJobId } from '../../src/jobs/reading-processing/reading-processing.types';
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
    {
      key: 'topic',
      type: 'select',
      label: 'Tema',
      required: true,
      options: ['LOVE', 'WORK', 'MONEY', 'PERSONAL'],
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

async function seedUser(email: string, password: string) {
  const passwordHash = await argon2.hash(password);
  const user = await prisma.user.create({
    data: { email, name: 'Test User', passwordHash, status: 'ACTIVE' },
  });
  const role = await ensureRole('USER', 'Usuario');
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  // Un registro real siempre crea una wallet (Fase 7); este helper inserta
  // el usuario directo por Prisma, sin pasar por AuthService.register(), así
  // que hay que recrear esa parte a mano con saldo de sobra para los tests.
  await prisma.wallet.create({ data: { userId: user.id, balance: 1000 } });
  return user;
}

function toCookieHeader(tokens: AuthTokens): string {
  return `access_token=${tokens.accessToken}; refresh_token=${tokens.refreshToken}`;
}

async function seedTarotThreeService() {
  const service = await prisma.service.upsert({
    where: { code: 'TAROT_THREE' },
    update: { isActive: true, creditCost: 10 },
    create: {
      code: 'TAROT_THREE',
      name: 'Tarot de tres cartas',
      description: 'Pasado, presente y tendencia.',
      creditCost: 10,
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

describe('Readings (integration, isolated database)', () => {
  let app: INestApplication;
  let authService: AuthService;
  let cacheService: CacheService;
  let readingQueue: Queue;
  let walletService: WalletService;

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

    authService = moduleRef.get(AuthService);
    cacheService = moduleRef.get(CacheService);
    readingQueue = moduleRef.get(getQueueToken(READING_PROCESSING_QUEUE));
    walletService = moduleRef.get(WalletService);

    await ensureRole('USER', 'Usuario');
    await seedTarotDeck();
    await seedTarotSpreads();
  });

  beforeEach(async () => {
    await prisma.reading.deleteMany();
    await prisma.user.deleteMany();
    await seedTarotThreeService();
    await cacheService.del(tarotDeckCacheKey(TAROT_DECK_CODE));
  });

  afterAll(async () => {
    // No worker runs during these tests, so every enqueued job stays
    // "waiting" forever unless we clear the test queue explicitly.
    await readingQueue.obliterate({ force: true });
    await app.close();
    await prisma.$disconnect();
  });

  it('returns 401 when there is no session', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/readings')
      .send({ serviceCode: 'TAROT_THREE' })
      .expect(401);
  });

  it('returns 404 when the service code does not exist', async () => {
    await seedUser('reading1@example.com', 'supersecret123');
    const { tokens } = await authService.login({
      email: 'reading1@example.com',
      password: 'supersecret123',
    });

    await request(app.getHttpServer())
      .post('/api/v1/readings')
      .set('Cookie', toCookieHeader(tokens))
      .send({ serviceCode: 'DOES_NOT_EXIST' })
      .expect(404);
  });

  it('walks a full DRAFT -> submit flow and persists three distinct, correctly ordered draws', async () => {
    await seedUser('reading2@example.com', 'supersecret123');
    const { tokens } = await authService.login({
      email: 'reading2@example.com',
      password: 'supersecret123',
    });
    const cookie = toCookieHeader(tokens);

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/readings')
      .set('Cookie', cookie)
      .send({ serviceCode: 'TAROT_THREE' })
      .expect(201);

    expect(createRes.body.reading.status).toBe('DRAFT');
    const readingId = createRes.body.reading.id as string;

    // Rejects incomplete/invalid input before persisting anything.
    await request(app.getHttpServer())
      .patch(`/api/v1/readings/${readingId}/inputs`)
      .set('Cookie', cookie)
      .send({ answers: { question: 'hi' } })
      .expect(400);

    // Cannot submit before the form is filled.
    await request(app.getHttpServer())
      .post(`/api/v1/readings/${readingId}/submit`)
      .set('Cookie', cookie)
      .expect(400);

    await request(app.getHttpServer())
      .patch(`/api/v1/readings/${readingId}/inputs`)
      .set('Cookie', cookie)
      .send({
        answers: { question: '¿Qué me depara el futuro?', topic: 'WORK' },
      })
      .expect(200);

    const submitRes = await request(app.getHttpServer())
      .post(`/api/v1/readings/${readingId}/submit`)
      .set('Cookie', cookie)
      .expect(200);

    expect(submitRes.body.reading.status).toBe('PENDING');
    expect(submitRes.body.reading.draws).toHaveLength(3);
    expect(
      submitRes.body.reading.draws.map((d: { position: string }) => d.position),
    ).toEqual(['PAST', 'PRESENT', 'TREND']);

    // No worker is running in this suite, so the job just sits here — but
    // it must have been enqueued for real, in the real Redis instance.
    const enqueuedJob = await readingQueue.getJob(
      tarotProcessingJobId(readingId),
    );
    expect(enqueuedJob).toBeDefined();
    expect(enqueuedJob?.data).toEqual({ readingId });
    const cardCodes = submitRes.body.reading.draws.map(
      (d: { card: { code: string } }) => d.card.code,
    );
    expect(new Set(cardCodes).size).toBe(3);

    // A submitted reading can no longer be edited, submitted again, or deleted.
    await request(app.getHttpServer())
      .patch(`/api/v1/readings/${readingId}/inputs`)
      .set('Cookie', cookie)
      .send({ answers: { question: 'Otra pregunta valida', topic: 'LOVE' } })
      .expect(400);

    await request(app.getHttpServer())
      .delete(`/api/v1/readings/${readingId}`)
      .set('Cookie', cookie)
      .expect(400);

    const getRes = await request(app.getHttpServer())
      .get(`/api/v1/readings/${readingId}`)
      .set('Cookie', cookie)
      .expect(200);
    expect(getRes.body.reading.status).toBe('PENDING');

    const listRes = await request(app.getHttpServer())
      .get('/api/v1/readings')
      .set('Cookie', cookie)
      .expect(200);
    expect(listRes.body.readings).toHaveLength(1);
  });

  it('allows deleting a DRAFT reading that was never submitted', async () => {
    await seedUser('reading3@example.com', 'supersecret123');
    const { tokens } = await authService.login({
      email: 'reading3@example.com',
      password: 'supersecret123',
    });
    const cookie = toCookieHeader(tokens);

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/readings')
      .set('Cookie', cookie)
      .send({ serviceCode: 'TAROT_THREE' })
      .expect(201);
    const readingId = createRes.body.reading.id as string;

    await request(app.getHttpServer())
      .delete(`/api/v1/readings/${readingId}`)
      .set('Cookie', cookie)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/v1/readings/${readingId}`)
      .set('Cookie', cookie)
      .expect(404);
  });

  it('never exposes or lets another user access someone else’s reading', async () => {
    await seedUser('owner@example.com', 'supersecret123');
    const { tokens: ownerTokens } = await authService.login({
      email: 'owner@example.com',
      password: 'supersecret123',
    });
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/readings')
      .set('Cookie', toCookieHeader(ownerTokens))
      .send({ serviceCode: 'TAROT_THREE' })
      .expect(201);
    const readingId = createRes.body.reading.id as string;

    await seedUser('intruder@example.com', 'supersecret123');
    const { tokens: intruderTokens } = await authService.login({
      email: 'intruder@example.com',
      password: 'supersecret123',
    });

    await request(app.getHttpServer())
      .get(`/api/v1/readings/${readingId}`)
      .set('Cookie', toCookieHeader(intruderTokens))
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/v1/readings/${readingId}/inputs`)
      .set('Cookie', toCookieHeader(intruderTokens))
      .send({ answers: { question: 'Not my reading', topic: 'WORK' } })
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/api/v1/readings/${readingId}`)
      .set('Cookie', toCookieHeader(intruderTokens))
      .expect(404);

    const intruderList = await request(app.getHttpServer())
      .get('/api/v1/readings')
      .set('Cookie', toCookieHeader(intruderTokens))
      .expect(200);
    expect(intruderList.body.readings).toHaveLength(0);
  });

  it('retries a real FAILED reading without recharging credits, and never lets someone else retry it', async () => {
    await seedUser('retryowner@example.com', 'supersecret123');
    const { tokens } = await authService.login({
      email: 'retryowner@example.com',
      password: 'supersecret123',
    });
    const cookie = toCookieHeader(tokens);

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/readings')
      .set('Cookie', cookie)
      .send({ serviceCode: 'TAROT_THREE' })
      .expect(201);
    const readingId = createRes.body.reading.id as string;

    await request(app.getHttpServer())
      .patch(`/api/v1/readings/${readingId}/inputs`)
      .set('Cookie', cookie)
      .send({
        answers: { question: '¿Qué me depara el futuro?', topic: 'WORK' },
      })
      .expect(200);

    // Retrying before the reading has even failed must be rejected.
    await request(app.getHttpServer())
      .post(`/api/v1/readings/${readingId}/retry`)
      .set('Cookie', cookie)
      .expect(400);

    await request(app.getHttpServer())
      .post(`/api/v1/readings/${readingId}/submit`)
      .set('Cookie', cookie)
      .expect(200);

    const walletAfterReserve = await request(app.getHttpServer())
      .get('/api/v1/wallet')
      .set('Cookie', cookie)
      .expect(200);
    expect(walletAfterReserve.body.wallet.balance).toBe(990);

    // Simula lo que un worker real haría al agotar sus reintentos de
    // infraestructura (ReadingProcessingConsumer.onFailed): libera la
    // reserva real y marca la lectura FAILED. Ningún worker corre en esta
    // suite (igual que el resto de tests de este archivo), así que se
    // reproduce ese efecto real con el mismo WalletService de producción.
    await walletService.releaseReservation(readingId);
    await prisma.reading.update({
      where: { id: readingId },
      data: { status: 'FAILED' },
    });

    // Otro usuario nunca puede reintentar una lectura ajena.
    await seedUser('retryintruder@example.com', 'supersecret123');
    const { tokens: intruderTokens } = await authService.login({
      email: 'retryintruder@example.com',
      password: 'supersecret123',
    });
    await request(app.getHttpServer())
      .post(`/api/v1/readings/${readingId}/retry`)
      .set('Cookie', toCookieHeader(intruderTokens))
      .expect(404);

    const retryRes = await request(app.getHttpServer())
      .post(`/api/v1/readings/${readingId}/retry`)
      .set('Cookie', cookie)
      .expect(200);
    expect(retryRes.body.reading.status).toBe('PENDING');

    // El saldo sigue siendo el ya devuelto por el fallo — el reintento real
    // nunca vuelve a debitar créditos.
    const walletAfterRetry = await request(app.getHttpServer())
      .get('/api/v1/wallet')
      .set('Cookie', cookie)
      .expect(200);
    expect(walletAfterRetry.body.wallet.balance).toBe(1000);

    // El job original nunca fue tomado por ningún worker en esta suite
    // (igual que el resto de tests de este archivo), así que sigue
    // esperando en Redis sin tocarse — el reintento real agrega un
    // segundo job nuevo con un jobId distinto, no reemplaza al primero.
    const originalJob = await readingQueue.getJob(
      tarotProcessingJobId(readingId),
    );
    expect(originalJob).toBeDefined();
    const waitingJobs = await readingQueue.getJobs(['waiting']);
    const retryJob = waitingJobs.find(
      (job) =>
        job.data.readingId === readingId &&
        job.id !== tarotProcessingJobId(readingId),
    );
    expect(retryJob).toBeDefined();
    expect(retryJob?.id).toContain(`PROCESS_TAROT-${readingId}-retry-`);

    // Ya no está FAILED, así que un segundo reintento inmediato se rechaza.
    await request(app.getHttpServer())
      .post(`/api/v1/readings/${readingId}/retry`)
      .set('Cookie', cookie)
      .expect(400);
  });
});
