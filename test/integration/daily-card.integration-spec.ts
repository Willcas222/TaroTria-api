process.env.DATABASE_URL =
  process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;
process.env.REDIS_URL = process.env.REDIS_URL_TEST ?? process.env.REDIS_URL;

import { createHmac } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import * as argon2 from '@node-rs/argon2';
import { AppModule } from '../../src/app.module';
import { AuthService, type AuthTokens } from '../../src/auth/auth.service';
import { CacheService } from '../../src/cache/cache.service';
import {
  TAROT_CARDS,
  TAROT_DECK_CODE,
  TAROT_DECK_NAME,
} from '../../prisma/seed-data/tarot-cards';
import { dailyCardCacheKey } from '../../src/daily-card/daily-card.constants';
import { tarotDeckCacheKey } from '../../src/tarot/tarot.constants';

const databaseUrl = process.env.DATABASE_URL as string;
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

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
  return user;
}

function toCookieHeader(tokens: AuthTokens): string {
  return `access_token=${tokens.accessToken}; refresh_token=${tokens.refreshToken}`;
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

describe('Daily card (integration, isolated database)', () => {
  let app: INestApplication;
  let authService: AuthService;
  let cacheService: CacheService;

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
    await ensureRole('USER', 'Usuario');
    await seedTarotDeck();
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
    await cacheService.del(tarotDeckCacheKey(TAROT_DECK_CODE));
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('returns 401 when there is no session', async () => {
    await request(app.getHttpServer()).get('/api/v1/daily-card').expect(401);
  });

  it('returns the deterministic card for the authenticated user, matching the HMAC selection', async () => {
    const user = await seedUser('dailycard1@example.com', 'supersecret123');
    const { tokens } = await authService.login({
      email: 'dailycard1@example.com',
      password: 'supersecret123',
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/daily-card')
      .set('Cookie', toCookieHeader(tokens))
      .expect(200);

    const today = new Date().toISOString().slice(0, 10);
    const cards = [...TAROT_CARDS].sort((a, b) => a.orderIndex - b.orderIndex);
    const digest = createHmac('sha256', process.env.DAILY_CARD_SECRET as string)
      .update(`${user.id}:${today}`)
      .digest();
    const expectedCard = cards[digest.readUInt32BE(0) % cards.length];
    const expectedOrientation = digest[4] % 2 === 0 ? 'UPRIGHT' : 'REVERSED';

    expect(res.body.date).toBe(today);
    expect(res.body.card.code).toBe(expectedCard.code);
    expect(res.body.orientation).toBe(expectedOrientation);
    expect(res.body.interpretation).toBe(
      expectedOrientation === 'UPRIGHT'
        ? expectedCard.uprightMeaning
        : expectedCard.reversedMeaning,
    );
    expect(res.body.disclaimer).toContain('fines de entretenimiento');
  });

  it('is stable across repeated calls for the same user on the same day', async () => {
    await seedUser('dailycard2@example.com', 'supersecret123');
    const { tokens } = await authService.login({
      email: 'dailycard2@example.com',
      password: 'supersecret123',
    });
    const cookie = toCookieHeader(tokens);

    const first = await request(app.getHttpServer())
      .get('/api/v1/daily-card')
      .set('Cookie', cookie)
      .expect(200);
    const second = await request(app.getHttpServer())
      .get('/api/v1/daily-card')
      .set('Cookie', cookie)
      .expect(200);

    expect(second.body).toEqual(first.body);
  });

  it('serves the second call from cache without recomputing', async () => {
    const user = await seedUser('dailycard3@example.com', 'supersecret123');
    const { tokens } = await authService.login({
      email: 'dailycard3@example.com',
      password: 'supersecret123',
    });

    await request(app.getHttpServer())
      .get('/api/v1/daily-card')
      .set('Cookie', toCookieHeader(tokens))
      .expect(200);

    const today = new Date().toISOString().slice(0, 10);
    const cached = await cacheService.get(dailyCardCacheKey(user.id, today));
    expect(cached).toBeTruthy();
  });
});
