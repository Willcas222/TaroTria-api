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
import { AI_PROVIDER } from '../../src/ai/ai-provider.interface';
import { AuthService, type AuthTokens } from '../../src/auth/auth.service';

const databaseUrl = process.env.DATABASE_URL as string;
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

const VALID_OUTPUT = {
  title: 'Título',
  summary: 'Resumen',
  cards: [{ position: 'PAST', cardCode: 'THE_FOOL', interpretation: 'x' }],
  insights: ['uno'],
  suggestedActions: ['dos'],
  closingReflection: 'reflexión',
  disclaimer: 'disclaimer',
};

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

// Must be the real TAROT_THREE_INTERPRETATION code: the orchestrator only
// knows how to validate output for tasks registered in AI_TASK_SCHEMAS, and
// that's currently the only one. Each test resets this prompt from scratch
// (including any AIExecution rows) so this suite never collides with
// test/integration/prompts.integration-spec.ts, which seeds the same code.
const TEST_PROMPT_CODE = 'TAROT_THREE_INTERPRETATION';

const PROMPT_PAYLOAD = {
  reason: 'prompt inicial para el playground de pruebas',
  code: TEST_PROMPT_CODE,
  name: 'Interpretación de tarot',
  systemPrompt: 'system',
  userPromptTemplate: 'Pregunta: {{question}}',
  model: 'gpt-4o-mini',
  outputSchema: { type: 'object' },
};

async function resetTestPrompt() {
  const existing = await prisma.prompt.findUnique({
    where: { code: TEST_PROMPT_CODE },
  });
  if (existing) {
    await prisma.aIExecution.deleteMany({
      where: { promptVersion: { promptId: existing.id } },
    });
    await prisma.promptVersion.deleteMany({
      where: { promptId: existing.id },
    });
    await prisma.prompt.delete({ where: { id: existing.id } });
  }
}

describe('Admin prompts + AI playground (integration, isolated database)', () => {
  let app: INestApplication;
  let authService: AuthService;
  let providerMock: { name: string; complete: jest.Mock };

  beforeAll(async () => {
    providerMock = { name: 'openai', complete: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AI_PROVIDER)
      .useValue(providerMock)
      .compile();

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
    await ensureRole('USER', 'Usuario');
    await ensureRole('ADMIN', 'Administrador');
  });

  beforeEach(async () => {
    await resetTestPrompt();
    await prisma.user.deleteMany();
    providerMock.complete.mockReset();
  });

  afterAll(async () => {
    await resetTestPrompt();
    await app.close();
    await prisma.$disconnect();
  });

  it('returns 401 when there is no session', async () => {
    await request(app.getHttpServer()).get('/api/v1/admin/prompts').expect(401);
  });

  it('rejects a regular USER from the admin prompts endpoints', async () => {
    await seedUser('regularprompt@example.com', 'supersecret123', 'USER');
    const { tokens } = await authService.login({
      email: 'regularprompt@example.com',
      password: 'supersecret123',
    });

    await request(app.getHttpServer())
      .get('/api/v1/admin/prompts')
      .set('Cookie', toCookieHeader(tokens))
      .expect(403);
  });

  it('walks the full lifecycle: create -> new version -> publish -> test (playground)', async () => {
    await seedUser('adminprompt@example.com', 'supersecret123', 'ADMIN');
    const { tokens } = await authService.login({
      email: 'adminprompt@example.com',
      password: 'supersecret123',
    });
    const cookie = toCookieHeader(tokens);

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/admin/prompts')
      .set('Cookie', cookie)
      .send(PROMPT_PAYLOAD)
      .expect(201);

    expect(createRes.body.prompt.versions).toHaveLength(1);
    expect(createRes.body.prompt.versions[0].status).toBe('DRAFT');
    const promptId = createRes.body.prompt.id as string;

    // Creating another prompt with the same code must fail.
    await request(app.getHttpServer())
      .post('/api/v1/admin/prompts')
      .set('Cookie', cookie)
      .send(PROMPT_PAYLOAD)
      .expect(409);

    // The playground refuses to run a prompt with no published version yet.
    providerMock.complete.mockResolvedValue({
      content: JSON.stringify(VALID_OUTPUT),
      model: 'gpt-4o-mini',
      tokensInput: 10,
      tokensOutput: 20,
      latencyMs: 5,
    });

    await request(app.getHttpServer())
      .post(`/api/v1/admin/prompts/${promptId}/publish`)
      .set('Cookie', cookie)
      .send({ reason: 'primera publicación del prompt' })
      .expect(201);

    const afterPublish = await request(app.getHttpServer())
      .get(`/api/v1/admin/prompts/${promptId}`)
      .set('Cookie', cookie)
      .expect(200);
    expect(afterPublish.body.prompt.versions[0].status).toBe('PUBLISHED');

    // Create a second version (DRAFT) without publishing it yet. Only the
    // version-content fields are sent — code/name belong to the prompt, not
    // to a version, and the endpoint rejects unknown properties.
    const versionPayload = {
      reason: 'nueva versión con mejoras de tono',
      systemPrompt: 'system v2',
      userPromptTemplate: PROMPT_PAYLOAD.userPromptTemplate,
      model: PROMPT_PAYLOAD.model,
      outputSchema: PROMPT_PAYLOAD.outputSchema,
    };
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/prompts/${promptId}`)
      .set('Cookie', cookie)
      .send(versionPayload)
      .expect(200);

    const afterV2 = await request(app.getHttpServer())
      .get(`/api/v1/admin/prompts/${promptId}`)
      .set('Cookie', cookie)
      .expect(200);
    expect(afterV2.body.prompt.versions).toHaveLength(2);
    const statuses = afterV2.body.prompt.versions.map(
      (v: { status: string }) => v.status,
    );
    expect(statuses).toContain('PUBLISHED');
    expect(statuses).toContain('DRAFT');

    // Playground test with no explicit promptVersionId defaults to the most
    // recent version — here that's the DRAFT v2, not the PUBLISHED v1. This
    // is what lets an admin try out a draft before publishing it.
    const testRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/prompts/${promptId}/test`)
      .set('Cookie', cookie)
      .send({ variables: { question: '¿Qué me depara?' } })
      .expect(201);

    expect(testRes.body.result.status).toBe('COMPLETED');
    expect(testRes.body.result.output).toEqual(VALID_OUTPUT);
    expect(providerMock.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        userPrompt: 'Pregunta: ¿Qué me depara?',
      }),
    );

    const execution = await prisma.aIExecution.findUnique({
      where: { id: testRes.body.result.aiExecutionId },
    });
    expect(execution).not.toBeNull();
    expect(execution?.status).toBe('COMPLETED');
    expect(execution?.promptVersionId).not.toBe(
      afterPublish.body.prompt.versions[0].id,
    );

    // Now actually publish v2: it becomes PUBLISHED and v1 gets archived.
    await request(app.getHttpServer())
      .post(`/api/v1/admin/prompts/${promptId}/publish`)
      .set('Cookie', cookie)
      .send({ reason: 'publicación de la v2 con mejoras de tono' })
      .expect(201);

    const afterSecondPublish = await request(app.getHttpServer())
      .get(`/api/v1/admin/prompts/${promptId}`)
      .set('Cookie', cookie)
      .expect(200);
    const statusesAfterSecondPublish = afterSecondPublish.body.prompt.versions
      .map((v: { status: string }) => v.status)
      .sort();
    expect(statusesAfterSecondPublish).toEqual(['ARCHIVED', 'PUBLISHED']);

    // Publishing again with no draft left must fail.
    await request(app.getHttpServer())
      .post(`/api/v1/admin/prompts/${promptId}/publish`)
      .set('Cookie', cookie)
      .send({ reason: 'intento de republicar sin borrador' })
      .expect(400);
  });

  it('the playground blocks high-risk input before calling the AI provider', async () => {
    await seedUser('adminrisk@example.com', 'supersecret123', 'ADMIN');
    const { tokens } = await authService.login({
      email: 'adminrisk@example.com',
      password: 'supersecret123',
    });
    const cookie = toCookieHeader(tokens);

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/admin/prompts')
      .set('Cookie', cookie)
      .send(PROMPT_PAYLOAD)
      .expect(201);
    const promptId = createRes.body.prompt.id as string;

    await request(app.getHttpServer())
      .post(`/api/v1/admin/prompts/${promptId}/publish`)
      .set('Cookie', cookie)
      .send({ reason: 'primera publicación del prompt' })
      .expect(201);

    const testRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/prompts/${promptId}/test`)
      .set('Cookie', cookie)
      .send({ variables: { question: 'quiero quitarme la vida' } })
      .expect(201);

    expect(testRes.body.result.status).toBe('FAILED');
    expect(providerMock.complete).not.toHaveBeenCalled();
  });
});
