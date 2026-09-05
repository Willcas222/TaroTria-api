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
import { AppModule } from '../../src/app.module';
import { AuthService, type AuthTokens } from '../../src/auth/auth.service';
import { CacheService } from '../../src/cache/cache.service';
import { SERVICES_LIST_CACHE_KEY } from '../../src/services/services.constants';

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

async function seedUser(
  email: string,
  password: string,
  roleCode: 'USER' | 'ADMIN',
) {
  const passwordHash = await argon2.hash(password);
  const user = await prisma.user.create({
    data: { email, name: 'Test User', passwordHash, status: 'ACTIVE' },
  });
  const role = await ensureRole(
    roleCode,
    roleCode === 'ADMIN' ? 'Administrador' : 'Usuario',
  );
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  return user;
}

function toCookieHeader(tokens: AuthTokens): string {
  return `access_token=${tokens.accessToken}; refresh_token=${tokens.refreshToken}`;
}

async function seedTarotThree() {
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
  await prisma.serviceForm.create({
    data: {
      serviceId: service.id,
      version: 1,
      schema: { fields: [{ key: 'question', type: 'textarea' }] },
      isActive: true,
    },
  });
  return service;
}

describe('Services catalog (integration, isolated database)', () => {
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
    await ensureRole('ADMIN', 'Administrador');
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
    await prisma.service.deleteMany();
    // Evita que el caché de una corrida anterior contamine esta.
    await cacheService.del(SERVICES_LIST_CACHE_KEY);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('public catalog', () => {
    it('lists active services with their active form schema', async () => {
      await seedTarotThree();
      await prisma.service.create({
        data: {
          code: 'DAILY_CARD',
          name: 'Carta diaria',
          description: null,
          creditCost: 0,
          isActive: false,
        },
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/services')
        .expect(200);

      expect(res.body.services).toHaveLength(1);
      expect(res.body.services[0]).toMatchObject({
        code: 'TAROT_THREE',
        creditCost: 10,
      });
      expect(res.body.services[0].formSchema).toBeTruthy();
    });

    it('returns 404 for an unknown or inactive service code', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/services/DOES_NOT_EXIST')
        .expect(404);
    });
  });

  describe('admin catalog management', () => {
    it('rejects a regular USER from admin catalog endpoints', async () => {
      await seedUser('regularsvc@example.com', 'supersecret123', 'USER');
      const { tokens } = await authService.login({
        email: 'regularsvc@example.com',
        password: 'supersecret123',
      });

      await request(app.getHttpServer())
        .get('/api/v1/admin/services')
        .set('Cookie', toCookieHeader(tokens))
        .expect(403);
    });

    it('updates creditCost as ADMIN and invalidates the cached public list', async () => {
      const service = await seedTarotThree();
      await seedUser('adminsvc@example.com', 'supersecret123', 'ADMIN');
      const { tokens } = await authService.login({
        email: 'adminsvc@example.com',
        password: 'supersecret123',
      });
      const cookie = toCookieHeader(tokens);

      // Populate the cache first.
      const before = await request(app.getHttpServer())
        .get('/api/v1/services')
        .expect(200);
      expect(before.body.services[0].creditCost).toBe(10);

      await request(app.getHttpServer())
        .patch(`/api/v1/admin/services/${service.id}`)
        .set('Cookie', cookie)
        .send({ creditCost: 25, reason: 'ajuste de precio promocional' })
        .expect(200);

      // Must reflect the new value immediately, not the stale cached one.
      const after = await request(app.getHttpServer())
        .get('/api/v1/services')
        .expect(200);
      expect(after.body.services[0].creditCost).toBe(25);
    });

    it('publishes a new form version and the public endpoint serves it', async () => {
      const service = await seedTarotThree();
      await seedUser('adminform@example.com', 'supersecret123', 'ADMIN');
      const { tokens } = await authService.login({
        email: 'adminform@example.com',
        password: 'supersecret123',
      });

      const publishRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/services/${service.id}/forms`)
        .set('Cookie', toCookieHeader(tokens))
        .send({
          schema: { fields: [{ key: 'topic', type: 'select' }] },
          reason: 'nueva pregunta de segmentación',
        })
        .expect(201);
      expect(publishRes.body.service.activeFormVersion).toBe(2);

      const publicRes = await request(app.getHttpServer())
        .get('/api/v1/services/TAROT_THREE')
        .expect(200);
      expect(publicRes.body.service.formSchema).toEqual({
        fields: [{ key: 'topic', type: 'select' }],
      });

      const formCount = await prisma.serviceForm.count({
        where: { serviceId: service.id },
      });
      expect(formCount).toBe(2);
    });
  });
});
