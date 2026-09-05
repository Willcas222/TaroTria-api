process.env.DATABASE_URL =
  process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;
process.env.REDIS_URL = process.env.REDIS_URL_TEST ?? process.env.REDIS_URL;

import { createHash } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../../src/app.module';

const databaseUrl = process.env.DATABASE_URL as string;
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

// Fijado por test/env-setup.ts (setupFiles de Jest, corre antes de que
// ConfigModule intente cargar .env — dotenv nunca sobreescribe process.env
// ya asignado), así el webhook real se firma con el mismo secreto que
// WompiProvider leerá dentro de la app bajo prueba.
const WOMPI_EVENTS_SECRET = process.env.WOMPI_EVENTS_SECRET as string;

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

// Reproduce exactamente el algoritmo de WompiProvider.verifyAndParseWebhook
// (mismo signature.properties que la implementación soporta) para poder
// mandar webhooks reales, firmados de verdad, en vez de mockear el proveedor.
function buildWompiWebhookPayload(params: {
  transactionId: string;
  status: string;
  amountInCents: number;
  currency: string;
  reference: string;
  timestamp: number;
}) {
  const properties = [
    'transaction.id',
    'transaction.status',
    'transaction.amount_in_cents',
  ];
  const concatenated = `${params.transactionId}${params.status}${params.amountInCents}`;
  const checksum = sha256Hex(
    `${concatenated}${params.timestamp}${WOMPI_EVENTS_SECRET}`,
  );

  return {
    event: 'transaction.updated',
    data: {
      transaction: {
        id: params.transactionId,
        status: params.status,
        amount_in_cents: params.amountInCents,
        reference: params.reference,
        currency: params.currency,
      },
    },
    timestamp: params.timestamp,
    signature: { properties, checksum },
  };
}

async function ensureRole(code: string, name: string) {
  return prisma.role.upsert({
    where: { code },
    update: {},
    create: { code, name },
  });
}

async function seedCreditPackage() {
  return prisma.creditPackage.upsert({
    where: { code: 'TEST_PACK' },
    update: {
      isActive: true,
      credits: 50,
      priceCents: 990000,
      currency: 'COP',
    },
    create: {
      code: 'TEST_PACK',
      name: 'Paquete de prueba',
      credits: 50,
      priceCents: 990000,
      currency: 'COP',
      isActive: true,
    },
  });
}

async function registerAndCreateCheckout(
  app: INestApplication,
  email: string,
): Promise<{ cookie: string; orderId: string; reference: string }> {
  const registerRes = await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send({ name: 'Payments Test', email, password: 'supersecret123' })
    .expect(201);
  const cookie = (registerRes.headers['set-cookie'] as unknown as string[])
    .map((c) => c.split(';')[0])
    .join('; ');

  const orderRes = await request(app.getHttpServer())
    .post('/api/v1/orders')
    .set('Cookie', cookie)
    .send({ packageCode: 'TEST_PACK' })
    .expect(201);
  const orderId = orderRes.body.order.id as string;

  const checkoutRes = await request(app.getHttpServer())
    .post('/api/v1/payments/wompi')
    .set('Cookie', cookie)
    .send({ orderId })
    .expect(201);
  const reference = checkoutRes.body.checkout.reference as string;

  return { cookie, orderId, reference };
}

describe('Payments and webhook idempotency (integration, isolated database)', () => {
  let app: INestApplication;

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

    await ensureRole('USER', 'Usuario');
  });

  beforeEach(async () => {
    await prisma.webhookEvent.deleteMany();
    await prisma.user.deleteMany();
    await seedCreditPackage();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('rejects a webhook with an invalid signature (401) and never touches the wallet', async () => {
    const { cookie, reference } = await registerAndCreateCheckout(
      app,
      `badsig-${Date.now()}@example.com`,
    );
    const payload = buildWompiWebhookPayload({
      transactionId: 'tx-badsig',
      status: 'APPROVED',
      amountInCents: 990000,
      currency: 'COP',
      reference,
      timestamp: Date.now(),
    });
    payload.signature.checksum = 'deadbeef'.repeat(8);

    await request(app.getHttpServer())
      .post('/api/v1/webhooks/wompi')
      .send(payload)
      .expect(401);

    const walletRes = await request(app.getHttpServer())
      .get('/api/v1/wallet')
      .set('Cookie', cookie)
      .expect(200);
    expect(walletRes.body.wallet.balance).toBe(10);
  });

  it('credits the wallet exactly once even when the identical APPROVED webhook is delivered three times', async () => {
    const { cookie, orderId, reference } = await registerAndCreateCheckout(
      app,
      `triple-${Date.now()}@example.com`,
    );
    const payload = buildWompiWebhookPayload({
      transactionId: 'tx-triple',
      status: 'APPROVED',
      amountInCents: 990000,
      currency: 'COP',
      reference,
      timestamp: Date.now(),
    });

    for (let i = 0; i < 3; i += 1) {
      await request(app.getHttpServer())
        .post('/api/v1/webhooks/wompi')
        .send(payload)
        .expect(200);
    }

    const walletRes = await request(app.getHttpServer())
      .get('/api/v1/wallet')
      .set('Cookie', cookie)
      .expect(200);
    expect(walletRes.body.wallet.balance).toBe(60); // 10 bono + 50 del paquete, una sola vez

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
    });
    expect(order.status).toBe('PAID');

    const purchaseTxCount = await prisma.walletTransaction.count({
      where: { orderId, type: 'PURCHASE' },
    });
    expect(purchaseTxCount).toBe(1);

    const webhookEventCount = await prisma.webhookEvent.count();
    expect(webhookEventCount).toBe(1); // deduplicado a nivel de entrega pese a 3 POSTs reales
  });

  it('handles out-of-order deliveries safely: a stale DECLINED arriving after APPROVED never reverts the payment or the order', async () => {
    const { cookie, orderId, reference } = await registerAndCreateCheckout(
      app,
      `outoforder-${Date.now()}@example.com`,
    );
    const baseTimestamp = Date.now();

    const approved = buildWompiWebhookPayload({
      transactionId: 'tx-order',
      status: 'APPROVED',
      amountInCents: 990000,
      currency: 'COP',
      reference,
      timestamp: baseTimestamp,
    });
    await request(app.getHttpServer())
      .post('/api/v1/webhooks/wompi')
      .send(approved)
      .expect(200);

    // Una entrega "atrasada" de un estado anterior (red lenta, reintento del
    // proveedor) con timestamp menor — el guard atómico sobre
    // Payment.status=PENDING ya no aplica (el pago quedó APPROVED), así que
    // esto no debe revertir nada.
    const staleDeclined = buildWompiWebhookPayload({
      transactionId: 'tx-order',
      status: 'DECLINED',
      amountInCents: 990000,
      currency: 'COP',
      reference,
      timestamp: baseTimestamp - 1000,
    });
    await request(app.getHttpServer())
      .post('/api/v1/webhooks/wompi')
      .send(staleDeclined)
      .expect(200);

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
    });
    expect(order.status).toBe('PAID');

    const walletRes = await request(app.getHttpServer())
      .get('/api/v1/wallet')
      .set('Cookie', cookie)
      .expect(200);
    expect(walletRes.body.wallet.balance).toBe(60);

    const purchaseTxCount = await prisma.walletTransaction.count({
      where: { orderId, type: 'PURCHASE' },
    });
    expect(purchaseTxCount).toBe(1);
  });

  it('refuses to process a webhook whose amount does not match the stored payment, crediting nothing', async () => {
    const { cookie, reference } = await registerAndCreateCheckout(
      app,
      `mismatch-${Date.now()}@example.com`,
    );
    const payload = buildWompiWebhookPayload({
      transactionId: 'tx-mismatch',
      status: 'APPROVED',
      amountInCents: 1,
      currency: 'COP',
      reference,
      timestamp: Date.now(),
    });

    await request(app.getHttpServer())
      .post('/api/v1/webhooks/wompi')
      .send(payload)
      .expect(200);

    const walletRes = await request(app.getHttpServer())
      .get('/api/v1/wallet')
      .set('Cookie', cookie)
      .expect(200);
    expect(walletRes.body.wallet.balance).toBe(10);
  });
});
