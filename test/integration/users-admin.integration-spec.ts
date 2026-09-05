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

describe('Users & admin (integration, isolated database)', () => {
  let app: INestApplication;
  let authService: AuthService;

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
    await ensureRole('USER', 'Usuario');
    await ensureRole('ADMIN', 'Administrador');
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('PATCH /users/me', () => {
    it('updates the profile name for the authenticated user', async () => {
      await seedUser('profile1@example.com', 'supersecret123', 'USER');
      const { tokens } = await authService.login({
        email: 'profile1@example.com',
        password: 'supersecret123',
      });

      const res = await request(app.getHttpServer())
        .patch('/api/v1/users/me')
        .set('Cookie', toCookieHeader(tokens))
        .send({ name: 'Nuevo Nombre' })
        .expect(200);

      expect(res.body.user.name).toBe('Nuevo Nombre');

      const dbUser = await prisma.user.findUniqueOrThrow({
        where: { email: 'profile1@example.com' },
      });
      expect(dbUser.name).toBe('Nuevo Nombre');
    });

    it('rejects the request without a valid session', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/users/me')
        .send({ name: 'Nuevo Nombre' })
        .expect(401);
    });
  });

  describe('DELETE /users/me', () => {
    it('soft-deletes the account, clears cookies, and revokes the session', async () => {
      await seedUser('delete1@example.com', 'supersecret123', 'USER');
      const { tokens } = await authService.login({
        email: 'delete1@example.com',
        password: 'supersecret123',
      });
      const cookie = toCookieHeader(tokens);

      const res = await request(app.getHttpServer())
        .delete('/api/v1/users/me')
        .set('Cookie', cookie)
        .expect(200);

      const clearedCookies = (res.headers['set-cookie'] ??
        []) as unknown as string[];
      expect(clearedCookies.some((c) => c.startsWith('access_token=;'))).toBe(
        true,
      );

      const dbUser = await prisma.user.findUniqueOrThrow({
        where: { email: 'delete1@example.com' },
      });
      expect(dbUser.status).toBe('DELETED');
      expect(dbUser.deletedAt).not.toBeNull();

      // El access token ya emitido deja de servir porque el estado ya no es ACTIVE.
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Cookie', cookie)
        .expect(401);

      // El refresh token también quedó revocado.
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie)
        .expect(401);
    });
  });

  describe('GET /admin/users', () => {
    it('allows an ADMIN user to list users', async () => {
      await seedUser('admin1@example.com', 'supersecret123', 'ADMIN');
      await seedUser('regular1@example.com', 'supersecret123', 'USER');
      const { tokens } = await authService.login({
        email: 'admin1@example.com',
        password: 'supersecret123',
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/users')
        .set('Cookie', toCookieHeader(tokens))
        .expect(200);

      expect(res.body.total).toBeGreaterThanOrEqual(2);
      expect(
        res.body.items.some(
          (u: { email: string }) => u.email === 'admin1@example.com',
        ),
      ).toBe(true);
      expect(res.body.items[0].passwordHash).toBeUndefined();
    });

    it('rejects a regular USER — a normal user cannot access administration', async () => {
      await seedUser('regular2@example.com', 'supersecret123', 'USER');
      const { tokens } = await authService.login({
        email: 'regular2@example.com',
        password: 'supersecret123',
      });

      await request(app.getHttpServer())
        .get('/api/v1/admin/users')
        .set('Cookie', toCookieHeader(tokens))
        .expect(403);
    });

    it('rejects an unauthenticated request', async () => {
      await request(app.getHttpServer()).get('/api/v1/admin/users').expect(401);
    });
  });
});
