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
import {
  NOTIFICATIONS_PROVIDER,
  type NotificationsProvider,
  type SendEmailInput,
} from '../../src/notifications/notifications-provider.interface';

const databaseUrl = process.env.DATABASE_URL as string;
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

async function ensureUserRole() {
  return prisma.role.upsert({
    where: { code: 'USER' },
    update: {},
    create: { code: 'USER', name: 'Usuario' },
  });
}

async function seedTestUser(email: string, password: string) {
  const passwordHash = await argon2.hash(password);
  const user = await prisma.user.create({
    data: { email, name: 'Ana Reader', passwordHash, status: 'ACTIVE' },
  });
  const role = await ensureUserRole();
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  return user;
}

function toCookieHeader(tokens: AuthTokens): string {
  return `access_token=${tokens.accessToken}; refresh_token=${tokens.refreshToken}`;
}

function toRequestCookieHeader(response: request.Response): string {
  const setCookies = (response.headers['set-cookie'] ??
    []) as unknown as string[];
  return setCookies.map((entry) => entry.split(';')[0]).join('; ');
}

function extractTokenFromUrl(url: string): string {
  const token = new URL(url).searchParams.get('token');
  if (!token) {
    throw new Error(`No token found in URL: ${url}`);
  }
  return token;
}

describe('Auth flow (integration, isolated database)', () => {
  let app: INestApplication;
  let authService: AuthService;
  let sentEmails: SendEmailInput[];

  const registerPayload = {
    name: 'Ana Reader',
    email: 'ana@example.com',
    password: 'supersecret123',
  };

  beforeAll(async () => {
    sentEmails = [];
    const spyNotificationsProvider: NotificationsProvider = {
      sendEmail: async (input) => {
        sentEmails.push(input);
      },
    };

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(NOTIFICATIONS_PROVIDER)
      .useValue(spyNotificationsProvider)
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
    await ensureUserRole();
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
    sentEmails.length = 0;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('registers a user, hashes the password, assigns the USER role, and sets httpOnly cookies', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(registerPayload)
      .expect(201);

    expect(response.body.user).toMatchObject({
      email: registerPayload.email,
      name: registerPayload.name,
      roles: ['USER'],
    });
    expect(response.body.user.passwordHash).toBeUndefined();

    const cookies = (response.headers['set-cookie'] ??
      []) as unknown as string[];
    expect(
      cookies.some(
        (c) => c.startsWith('access_token=') && c.includes('HttpOnly'),
      ),
    ).toBe(true);
    expect(
      cookies.some(
        (c) => c.startsWith('refresh_token=') && c.includes('HttpOnly'),
      ),
    ).toBe(true);

    const dbUser = await prisma.user.findUniqueOrThrow({
      where: { email: registerPayload.email },
    });
    expect(dbUser.passwordHash).not.toBe(registerPayload.password);

    const refreshTokenCount = await prisma.refreshToken.count({
      where: { userId: dbUser.id },
    });
    expect(refreshTokenCount).toBe(1);
  });

  it('rejects registering the same email twice', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(registerPayload)
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(registerPayload)
      .expect(409);
  });

  it('logs in with correct credentials and rejects a wrong password with a generic message', async () => {
    await seedTestUser(registerPayload.email, registerPayload.password);

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: registerPayload.email,
        password: registerPayload.password,
      })
      .expect(200);
    expect(loginRes.body.user.email).toBe(registerPayload.email);

    const badLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: registerPayload.email, password: 'wrong-password' })
      .expect(401);
    expect(badLogin.body.message).toBe('Credenciales inválidas.');
  });

  it('rejects login for a non-existent email with the same generic message', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'whatever123' })
      .expect(401);
    expect(res.body.message).toBe('Credenciales inválidas.');
  });

  it('returns the current user profile from /auth/me when authenticated via cookie', async () => {
    await seedTestUser(registerPayload.email, registerPayload.password);
    const agent = request.agent(app.getHttpServer());

    await agent
      .post('/api/v1/auth/login')
      .send({
        email: registerPayload.email,
        password: registerPayload.password,
      })
      .expect(200);

    const meRes = await agent.get('/api/v1/auth/me').expect(200);
    expect(meRes.body.user.email).toBe(registerPayload.email);
  });

  it('rejects /auth/me without a valid session cookie', async () => {
    await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
  });

  describe('refresh', () => {
    // Estas pruebas obtienen tokens llamando a AuthService directamente
    // (no vía HTTP) para no consumir el rate limit de /auth/login, que no
    // es lo que se está probando aquí.

    it('rotates the refresh token: the new one works and the old one is now invalid', async () => {
      await seedTestUser('refresh1@example.com', 'supersecret123');
      const { tokens } = await authService.login({
        email: 'refresh1@example.com',
        password: 'supersecret123',
      });
      const originalCookie = toCookieHeader(tokens);

      const refreshRes = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', originalCookie)
        .expect(200);

      const rotatedCookie = toRequestCookieHeader(refreshRes);
      expect(rotatedCookie).toContain('refresh_token=');

      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', rotatedCookie)
        .expect(200);
    });

    it('detects reuse of an already-rotated refresh token and revokes the whole session', async () => {
      await seedTestUser('refresh2@example.com', 'supersecret123');
      const { tokens } = await authService.login({
        email: 'refresh2@example.com',
        password: 'supersecret123',
      });
      const originalCookie = toCookieHeader(tokens);

      const firstRefresh = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', originalCookie)
        .expect(200);
      const rotatedCookie = toRequestCookieHeader(firstRefresh);

      const reuseRes = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', originalCookie)
        .expect(401);
      expect(reuseRes.body.message).toMatch(/inicia sesión de nuevo/);

      // La reutilización revoca también el token ya rotado (toda la familia).
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', rotatedCookie)
        .expect(401);
    });

    it('rejects refresh without a refresh token cookie', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .expect(401);
    });
  });

  describe('logout', () => {
    it('revokes the refresh token so it can no longer be used to refresh', async () => {
      await seedTestUser('logout1@example.com', 'supersecret123');
      const { tokens } = await authService.login({
        email: 'logout1@example.com',
        password: 'supersecret123',
      });
      const cookie = toCookieHeader(tokens);

      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Cookie', cookie)
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie)
        .expect(401);
    });

    it('is idempotent when called without a session cookie', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .expect(200);
    });
  });

  describe('verify-email', () => {
    it('registers a user, sends a verification email, and verifies the account with the token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(registerPayload)
        .expect(201);

      expect(sentEmails).toHaveLength(1);
      expect(sentEmails[0].to).toBe(registerPayload.email);
      const token = extractTokenFromUrl(
        sentEmails[0].context.verificationUrl as string,
      );

      const verifyRes = await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({ token })
        .expect(200);

      expect(verifyRes.body.user.emailVerifiedAt).not.toBeNull();

      const dbUser = await prisma.user.findUniqueOrThrow({
        where: { email: registerPayload.email },
      });
      expect(dbUser.emailVerifiedAt).not.toBeNull();
    });

    it('rejects an invalid verification token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({ token: 'a'.repeat(64) })
        .expect(401);
      expect(res.body.message).toMatch(/inválido o expiró/);
    });

    it('rejects reusing an already-verified token', async () => {
      const user = await seedTestUser('verify2@example.com', 'supersecret123');
      const userWithRoles = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        include: { userRoles: { include: { role: true } } },
      });
      await authService.sendVerificationEmail(userWithRoles);

      const token = extractTokenFromUrl(
        sentEmails[sentEmails.length - 1].context.verificationUrl as string,
      );

      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({ token })
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .send({ token })
        .expect(401);
    });
  });

  describe('forgot-password / reset-password', () => {
    it('sends a reset email, resets the password, and revokes existing sessions', async () => {
      await seedTestUser('reset1@example.com', 'old-supersecret1');
      const { tokens: oldTokens } = await authService.login({
        email: 'reset1@example.com',
        password: 'old-supersecret1',
      });
      const oldCookie = toCookieHeader(oldTokens);

      await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'reset1@example.com' })
        .expect(200);

      expect(sentEmails).toHaveLength(1);
      const token = extractTokenFromUrl(
        sentEmails[0].context.resetUrl as string,
      );

      await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({ token, password: 'new-supersecret1' })
        .expect(200);

      // La contraseña vieja ya no sirve; la nueva sí.
      await expect(
        authService.login({
          email: 'reset1@example.com',
          password: 'old-supersecret1',
        }),
      ).rejects.toThrow();

      const relog = await authService.login({
        email: 'reset1@example.com',
        password: 'new-supersecret1',
      });
      expect(relog.user.email).toBe('reset1@example.com');

      // El refresh token emitido antes del reset quedó revocado.
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', oldCookie)
        .expect(401);
    });

    it('returns success for a non-existent email without sending anything', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'nobody-reset@example.com' })
        .expect(200);

      expect(sentEmails).toHaveLength(0);
    });

    it('rejects resetting with an invalid token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({ token: 'a'.repeat(64), password: 'new-supersecret1' })
        .expect(401);
      expect(res.body.message).toMatch(/inválido o expiró/);
    });

    it('rejects reusing an already-used reset token', async () => {
      await seedTestUser('reset2@example.com', 'old-supersecret2');

      await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'reset2@example.com' })
        .expect(200);

      const token = extractTokenFromUrl(
        sentEmails[sentEmails.length - 1].context.resetUrl as string,
      );

      await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({ token, password: 'new-supersecret2' })
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({ token, password: 'another-password3' })
        .expect(401);
    });
  });
});
