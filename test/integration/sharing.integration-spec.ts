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
import { ShareImageConsumerModule } from '../../src/jobs/share-image/share-image-consumer.module';
import { ShareImageProcessor } from '../../src/jobs/share-image/share-image.processor';
import {
  TAROT_CARDS,
  TAROT_DECK_CODE,
  TAROT_DECK_NAME,
} from '../../prisma/seed-data/tarot-cards';
import { TAROT_SPREADS } from '../../prisma/seed-data/tarot-spreads';
import {
  READING_PROCESSING_QUEUE,
  SHARE_IMAGE_QUEUE,
} from '../../src/queues/queues.module';
import { tarotDeckCacheKey } from '../../src/tarot/tarot.constants';

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

const PRIVATE_QUESTION = '¿Volverá mi ex pareja conmigo este año?';

async function ensureRole(code: string, name: string) {
  return prisma.role.upsert({
    where: { code },
    update: {},
    create: { code, name },
  });
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

async function registerAndCompleteForm(
  app: INestApplication,
  email: string,
): Promise<{ cookie: string; readingId: string }> {
  const registerRes = await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send({ name: 'Sharing Test', email, password: 'supersecret123' })
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
    .send({ answers: { question: PRIVATE_QUESTION } })
    .expect(200);

  return { cookie, readingId };
}

describe('Sharing (integration, isolated database)', () => {
  let app: INestApplication;
  let shareImageProcessor: ShareImageProcessor;
  let readingQueue: Queue;
  let shareImageQueue: Queue;
  let cacheService: CacheService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, ShareImageConsumerModule],
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

    shareImageProcessor = moduleRef.get(ShareImageProcessor);
    readingQueue = moduleRef.get(getQueueToken(READING_PROCESSING_QUEUE));
    shareImageQueue = moduleRef.get(getQueueToken(SHARE_IMAGE_QUEUE));
    cacheService = moduleRef.get(CacheService);

    await ensureRole('USER', 'Usuario');
    await seedTarotDeck();
    await seedTarotSpreads();
  });

  beforeEach(async () => {
    await prisma.analyticsEvent.deleteMany();
    await prisma.reading.deleteMany();
    await prisma.user.deleteMany();
    await seedTarotThreeService();
    // El mazo se siembra una sola vez en beforeAll preservando ids (upsert
    // por code), pero si una corrida anterior dejó cacheado en Redis un
    // mazo con otra forma (mismo bug ya documentado en Fase 3: un cambio de
    // catálogo cacheado necesita invalidar su caché), el draw engine puede
    // referenciar cardIds que ya no existen — se limpia antes de cada test.
    await cacheService.del(tarotDeckCacheKey(TAROT_DECK_CODE));
  });

  afterAll(async () => {
    await readingQueue.obliterate({ force: true });
    await shareImageQueue.obliterate({ force: true });
    await app.close();
    await prisma.$disconnect();
  });

  // Un solo test cubre todo el ciclo de vida real con una sola cuenta
  // registrada (el límite de 5 registros/min/IP de la sección 17 no da para
  // repartir esto en más tests dentro del mismo archivo): rechazo mientras
  // no está COMPLETED, creación idempotente, resumen saneado público, imagen
  // real generada, y revocación real que corta el acceso de inmediato.
  it('shares a real COMPLETED reading end to end: sanitized summary, real image, idempotent creation, and real revocation', async () => {
    const { cookie, readingId } = await registerAndCompleteForm(
      app,
      `share-${Date.now()}@example.com`,
    );

    // Todavía DRAFT: no se puede compartir.
    await request(app.getHttpServer())
      .post(`/api/v1/readings/${readingId}/share`)
      .set('Cookie', cookie)
      .expect(400);

    await request(app.getHttpServer())
      .post(`/api/v1/readings/${readingId}/submit`)
      .set('Cookie', cookie)
      .expect(200);
    await prisma.reading.update({
      where: { id: readingId },
      data: { status: 'COMPLETED' },
    });

    const shareRes = await request(app.getHttpServer())
      .post(`/api/v1/readings/${readingId}/share`)
      .set('Cookie', cookie)
      .expect(201);
    const token = shareRes.body.share.token as string;
    expect(shareRes.body.share.url).toContain(`/r/${token}`);

    // Idempotente: un segundo POST devuelve el mismo token, no uno nuevo.
    const secondShareRes = await request(app.getHttpServer())
      .post(`/api/v1/readings/${readingId}/share`)
      .set('Cookie', cookie)
      .expect(201);
    expect(secondShareRes.body.share.token).toBe(token);

    // Público, real, sin cookie de sesión.
    const summaryRes = await request(app.getHttpServer())
      .get(`/api/v1/shared/${token}`)
      .expect(200);
    expect(summaryRes.body.summary.readingType).toBe('TAROT');
    expect(summaryRes.body.summary.cards).toHaveLength(3);
    const rawSummary = JSON.stringify(summaryRes.body.summary);
    expect(rawSummary).not.toContain(PRIVATE_QUESTION);
    expect(summaryRes.body.summary.imageUrl).toBeNull();

    // Worker real para esta imagen puntual (sin worker de fondo corriendo en
    // esta suite): render SVG real, sharp real, subida real al bucket.
    await shareImageProcessor.generateImage(token);

    const summaryAfterImage = await request(app.getHttpServer())
      .get(`/api/v1/shared/${token}`)
      .expect(200);
    expect(summaryAfterImage.body.summary.imageUrl).toContain(
      `/shared/${token}/image`,
    );

    const imageRes = await request(app.getHttpServer())
      .get(`/api/v1/shared/${token}/image`)
      .expect(200);
    expect(imageRes.headers['content-type']).toBe('image/png');
    expect(
      Buffer.isBuffer(imageRes.body) ? imageRes.body.length : 0,
    ).toBeGreaterThan(1000);
    // Bug real encontrado verificando en un navegador de verdad: Helmet pone
    // Cross-Origin-Resource-Policy: same-origin en toda la API por defecto,
    // lo que un curl nunca detecta pero un <img> cross-origin sí bloquea.
    expect(imageRes.headers['cross-origin-resource-policy']).toBe(
      'cross-origin',
    );

    // Revocación real: el enlace y la imagen dejan de ser accesibles.
    await request(app.getHttpServer())
      .delete(`/api/v1/readings/${readingId}/share`)
      .set('Cookie', cookie)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/api/v1/shared/${token}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/shared/${token}/image`)
      .expect(404);
  });

  it('never lets a user share a reading that belongs to someone else', async () => {
    const { readingId } = await registerAndCompleteForm(
      app,
      `owner-${Date.now()}@example.com`,
    );
    const { cookie: intruder } = await registerAndCompleteForm(
      app,
      `intruder-${Date.now()}@example.com`,
    );

    await request(app.getHttpServer())
      .post(`/api/v1/readings/${readingId}/share`)
      .set('Cookie', intruder)
      .expect(404);
  });

  it('attributes a real signup through the referral token to a SHARE_SIGNUP analytics event', async () => {
    const { cookie, readingId } = await registerAndCompleteForm(
      app,
      `referrer-${Date.now()}@example.com`,
    );
    await request(app.getHttpServer())
      .post(`/api/v1/readings/${readingId}/submit`)
      .set('Cookie', cookie)
      .expect(200);
    await prisma.reading.update({
      where: { id: readingId },
      data: { status: 'COMPLETED' },
    });

    const shareRes = await request(app.getHttpServer())
      .post(`/api/v1/readings/${readingId}/share`)
      .set('Cookie', cookie)
      .expect(201);
    const token = shareRes.body.share.token as string;

    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        name: 'Referred User',
        email: `referred-${Date.now()}@example.com`,
        password: 'supersecret123',
        referralToken: token,
      })
      .expect(201);

    const events = await prisma.analyticsEvent.findMany({
      where: { type: 'SHARE_SIGNUP', shareLinkId: token },
    });
    expect(events).toHaveLength(1);
    expect(events[0].userId).toBe(registerRes.body.user.id);
  });
});
