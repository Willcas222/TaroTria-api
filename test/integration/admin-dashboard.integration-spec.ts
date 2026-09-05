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
import { READING_PROCESSING_QUEUE } from '../../src/queues/queues.module';

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

async function seedTarotThreeService() {
  return prisma.service.upsert({
    where: { code: 'TAROT_THREE' },
    update: { isActive: true, creditCost: 10 },
    create: {
      code: 'TAROT_THREE',
      name: 'Tarot de tres cartas',
      description: 'Pasado, presente y tendencia.',
      creditCost: 10,
    },
  });
}

describe('Admin dashboard: auditoría, ajustes de saldo, lecturas, IA y métricas (integration, isolated database)', () => {
  let app: INestApplication;
  let authService: AuthService;
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

    authService = moduleRef.get(AuthService);
    readingQueue = moduleRef.get(getQueueToken(READING_PROCESSING_QUEUE));
    await ensureRole('USER', 'Usuario');
    await ensureRole('ADMIN', 'Administrador');
  });

  beforeEach(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.reading.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await readingQueue.obliterate({ force: true });
    await app.close();
    await prisma.$disconnect();
  });

  describe('POST /admin/wallet-adjustments', () => {
    it('rejects an unauthenticated request', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/wallet-adjustments')
        .send({ userId: 'x', amount: 5, reason: 'motivo' })
        .expect(401);
    });

    it('rejects a regular USER', async () => {
      const target = await seedUser(
        'target1@example.com',
        'supersecret123',
        'USER',
      );
      const { tokens } = await authService.login({
        email: 'target1@example.com',
        password: 'supersecret123',
      });

      await request(app.getHttpServer())
        .post('/api/v1/admin/wallet-adjustments')
        .set('Cookie', toCookieHeader(tokens))
        .send({ userId: target.id, amount: 5, reason: 'motivo' })
        .expect(403);
    });

    it('rejects a request with no reason', async () => {
      const target = await seedUser(
        'target2@example.com',
        'supersecret123',
        'USER',
      );
      await seedUser('admin2@example.com', 'supersecret123', 'ADMIN');
      const { tokens } = await authService.login({
        email: 'admin2@example.com',
        password: 'supersecret123',
      });

      await request(app.getHttpServer())
        .post('/api/v1/admin/wallet-adjustments')
        .set('Cookie', toCookieHeader(tokens))
        .send({ userId: target.id, amount: 5 })
        .expect(400);
    });

    it('credits and debits a real wallet with a motivated adjustment, recording an audit log for each, and rejects a debit that would go negative', async () => {
      const target = await seedUser(
        'target3@example.com',
        'supersecret123',
        'USER',
      );
      // seedUser crea el usuario directo por Prisma (no pasa por el registro
      // real), así que su wallet no existe todavía — se crea aquí con el
      // mismo saldo inicial que el bono real de registro.
      await prisma.wallet.create({ data: { userId: target.id, balance: 10 } });
      const admin = await seedUser(
        'admin3@example.com',
        'supersecret123',
        'ADMIN',
      );
      const { tokens } = await authService.login({
        email: 'admin3@example.com',
        password: 'supersecret123',
      });
      const cookie = toCookieHeader(tokens);

      const creditRes = await request(app.getHttpServer())
        .post('/api/v1/admin/wallet-adjustments')
        .set('Cookie', cookie)
        .send({
          userId: target.id,
          amount: 20,
          reason: 'compensación por incidente de soporte',
        })
        .expect(201);
      expect(creditRes.body.wallet.balance).toBe(30);

      const debitRes = await request(app.getHttpServer())
        .post('/api/v1/admin/wallet-adjustments')
        .set('Cookie', cookie)
        .send({
          userId: target.id,
          amount: -5,
          reason: 'corrección de saldo duplicado',
        })
        .expect(201);
      expect(debitRes.body.wallet.balance).toBe(25);

      // No puede dejar el saldo en negativo.
      await request(app.getHttpServer())
        .post('/api/v1/admin/wallet-adjustments')
        .set('Cookie', cookie)
        .send({
          userId: target.id,
          amount: -1000,
          reason: 'intento de sobregiro',
        })
        .expect(400);

      const transactions = await prisma.walletTransaction.findMany({
        where: { wallet: { userId: target.id }, type: 'ADJUSTMENT' },
      });
      expect(transactions).toHaveLength(2);

      const auditRes = await request(app.getHttpServer())
        .get('/api/v1/admin/audit-logs')
        .set('Cookie', cookie)
        .expect(200);
      const adjustmentLogs = auditRes.body.items.filter(
        (log: { action: string }) => log.action === 'wallet.adjustment',
      );
      expect(adjustmentLogs).toHaveLength(2);
      expect(adjustmentLogs[0].actorUserId).toBe(admin.id);
      expect(adjustmentLogs[0].targetId).toBe(target.id);
      expect(
        adjustmentLogs.some(
          (log: { reason: string }) =>
            log.reason === 'corrección de saldo duplicado',
        ),
      ).toBe(true);
    });
  });

  describe('GET /admin/audit-logs', () => {
    it('rejects a regular USER', async () => {
      await seedUser('regularaudit@example.com', 'supersecret123', 'USER');
      const { tokens } = await authService.login({
        email: 'regularaudit@example.com',
        password: 'supersecret123',
      });

      await request(app.getHttpServer())
        .get('/api/v1/admin/audit-logs')
        .set('Cookie', toCookieHeader(tokens))
        .expect(403);
    });
  });

  describe('GET /admin/readings', () => {
    it('lists real readings across users with pagination, restricted to ADMIN', async () => {
      const service = await seedTarotThreeService();
      const owner = await seedUser(
        'readingowner@example.com',
        'supersecret123',
        'USER',
      );
      await prisma.reading.create({
        data: { userId: owner.id, serviceId: service.id, status: 'COMPLETED' },
      });
      await seedUser('adminreadings@example.com', 'supersecret123', 'ADMIN');
      const { tokens } = await authService.login({
        email: 'adminreadings@example.com',
        password: 'supersecret123',
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/readings')
        .set('Cookie', toCookieHeader(tokens))
        .expect(200);

      expect(res.body.total).toBeGreaterThanOrEqual(1);
      expect(
        res.body.items.some(
          (r: { userEmail: string }) =>
            r.userEmail === 'readingowner@example.com',
        ),
      ).toBe(true);

      await request(app.getHttpServer())
        .get('/api/v1/admin/readings?status=COMPLETED')
        .set('Cookie', toCookieHeader(tokens))
        .expect(200);
    });

    it('rejects a regular USER', async () => {
      await seedUser('regularreadings@example.com', 'supersecret123', 'USER');
      const { tokens } = await authService.login({
        email: 'regularreadings@example.com',
        password: 'supersecret123',
      });

      await request(app.getHttpServer())
        .get('/api/v1/admin/readings')
        .set('Cookie', toCookieHeader(tokens))
        .expect(403);
    });
  });

  describe('POST /admin/readings/:id/retry', () => {
    it('rejects a regular USER', async () => {
      const service = await seedTarotThreeService();
      const owner = await seedUser(
        'retrytarget1@example.com',
        'supersecret123',
        'USER',
      );
      const reading = await prisma.reading.create({
        data: { userId: owner.id, serviceId: service.id, status: 'FAILED' },
      });
      await seedUser('regularretry@example.com', 'supersecret123', 'USER');
      const { tokens } = await authService.login({
        email: 'regularretry@example.com',
        password: 'supersecret123',
      });

      await request(app.getHttpServer())
        .post(`/api/v1/admin/readings/${reading.id}/retry`)
        .set('Cookie', toCookieHeader(tokens))
        .send({ reason: 'motivo' })
        .expect(403);
    });

    it('rejects a request with no reason', async () => {
      const service = await seedTarotThreeService();
      const owner = await seedUser(
        'retrytarget2@example.com',
        'supersecret123',
        'USER',
      );
      const reading = await prisma.reading.create({
        data: { userId: owner.id, serviceId: service.id, status: 'FAILED' },
      });
      await seedUser(
        'adminretrynoreason@example.com',
        'supersecret123',
        'ADMIN',
      );
      const { tokens } = await authService.login({
        email: 'adminretrynoreason@example.com',
        password: 'supersecret123',
      });

      await request(app.getHttpServer())
        .post(`/api/v1/admin/readings/${reading.id}/retry`)
        .set('Cookie', toCookieHeader(tokens))
        .expect(400);
    });

    it('retries a real FAILED reading owned by any user, enqueues a real job, and logs the audit entry with the reason', async () => {
      const service = await seedTarotThreeService();
      const owner = await seedUser(
        'retrytarget3@example.com',
        'supersecret123',
        'USER',
      );
      const reading = await prisma.reading.create({
        data: { userId: owner.id, serviceId: service.id, status: 'FAILED' },
      });
      const admin = await seedUser(
        'adminretry3@example.com',
        'supersecret123',
        'ADMIN',
      );
      const { tokens } = await authService.login({
        email: 'adminretry3@example.com',
        password: 'supersecret123',
      });
      const cookie = toCookieHeader(tokens);

      const retryRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/readings/${reading.id}/retry`)
        .set('Cookie', cookie)
        .send({ reason: 'reintento operativo tras incidente de OpenAI' })
        .expect(200);
      expect(retryRes.body.reading.status).toBe('PENDING');

      const auditRes = await request(app.getHttpServer())
        .get('/api/v1/admin/audit-logs')
        .set('Cookie', cookie)
        .expect(200);
      const retryLogs = auditRes.body.items.filter(
        (log: { action: string }) => log.action === 'reading.retry',
      );
      expect(retryLogs).toHaveLength(1);
      expect(retryLogs[0].actorUserId).toBe(admin.id);
      expect(retryLogs[0].targetId).toBe(reading.id);
      expect(retryLogs[0].reason).toBe(
        'reintento operativo tras incidente de OpenAI',
      );

      const waitingJobs = await readingQueue.getJobs(['waiting']);
      const retryJob = waitingJobs.find(
        (job) => job.data.readingId === reading.id,
      );
      expect(retryJob).toBeDefined();
      expect(retryJob?.id).toContain(`PROCESS_TAROT-${reading.id}-retry-`);
    });

    it('rejects retrying a reading that is not FAILED', async () => {
      const service = await seedTarotThreeService();
      const owner = await seedUser(
        'retrytarget4@example.com',
        'supersecret123',
        'USER',
      );
      const reading = await prisma.reading.create({
        data: { userId: owner.id, serviceId: service.id, status: 'COMPLETED' },
      });
      await seedUser('adminretry4@example.com', 'supersecret123', 'ADMIN');
      const { tokens } = await authService.login({
        email: 'adminretry4@example.com',
        password: 'supersecret123',
      });

      await request(app.getHttpServer())
        .post(`/api/v1/admin/readings/${reading.id}/retry`)
        .set('Cookie', toCookieHeader(tokens))
        .send({ reason: 'motivo' })
        .expect(400);
    });
  });

  describe('GET /admin/ai-executions', () => {
    it('rejects a regular USER and allows ADMIN to list (possibly empty)', async () => {
      await seedUser('regularai@example.com', 'supersecret123', 'USER');
      const { tokens: userTokens } = await authService.login({
        email: 'regularai@example.com',
        password: 'supersecret123',
      });
      await request(app.getHttpServer())
        .get('/api/v1/admin/ai-executions')
        .set('Cookie', toCookieHeader(userTokens))
        .expect(403);

      await seedUser('adminai@example.com', 'supersecret123', 'ADMIN');
      const { tokens: adminTokens } = await authService.login({
        email: 'adminai@example.com',
        password: 'supersecret123',
      });
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/ai-executions')
        .set('Cookie', toCookieHeader(adminTokens))
        .expect(200);
      expect(res.body).toHaveProperty('items');
      expect(res.body).toHaveProperty('total');
    });
  });

  describe('GET /admin/metrics', () => {
    it('returns real aggregated metrics, restricted to ADMIN', async () => {
      const service = await seedTarotThreeService();
      const owner = await seedUser(
        'metricsowner@example.com',
        'supersecret123',
        'USER',
      );
      await prisma.reading.create({
        data: { userId: owner.id, serviceId: service.id, status: 'COMPLETED' },
      });
      await seedUser('adminmetrics@example.com', 'supersecret123', 'ADMIN');
      const { tokens } = await authService.login({
        email: 'adminmetrics@example.com',
        password: 'supersecret123',
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/metrics')
        .set('Cookie', toCookieHeader(tokens))
        .expect(200);

      expect(res.body.metrics.totalUsers).toBeGreaterThanOrEqual(2);
      expect(
        res.body.metrics.readingsByStatus.COMPLETED,
      ).toBeGreaterThanOrEqual(1);
      expect(typeof res.body.metrics.marginCents).toBe('number');
      expect(res.body.metrics.currency).toBe('COP');
    });

    it('rejects a regular USER', async () => {
      await seedUser('regularmetrics@example.com', 'supersecret123', 'USER');
      const { tokens } = await authService.login({
        email: 'regularmetrics@example.com',
        password: 'supersecret123',
      });

      await request(app.getHttpServer())
        .get('/api/v1/admin/metrics')
        .set('Cookie', toCookieHeader(tokens))
        .expect(403);
    });
  });
});
