import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const databaseUrl =
  process.env.DATABASE_URL_TEST ??
  'postgresql://oracle:oracle@localhost:5432/oracle_api_test?schema=public';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

async function createUser(email: string) {
  return prisma.user.create({
    data: { email, name: 'Test User', passwordHash: 'hash' },
  });
}

describe('Auth data model (integration, isolated database)', () => {
  beforeEach(async () => {
    await prisma.refreshToken.deleteMany();
    await prisma.userRole.deleteMany();
    await prisma.user.deleteMany();
    await prisma.role.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('enforces a unique role code', async () => {
    await prisma.role.create({ data: { code: 'USER', name: 'Usuario' } });

    await expect(
      prisma.role.create({ data: { code: 'USER', name: 'Duplicado' } }),
    ).rejects.toThrow();
  });

  it('prevents assigning the same role to a user twice', async () => {
    const user = await createUser('roles@example.com');
    const role = await prisma.role.create({
      data: { code: 'ADMIN', name: 'Administrador' },
    });

    await prisma.userRole.create({
      data: { userId: user.id, roleId: role.id },
    });

    await expect(
      prisma.userRole.create({ data: { userId: user.id, roleId: role.id } }),
    ).rejects.toThrow();
  });

  it('cascades deleting a user to its roles and refresh tokens', async () => {
    const user = await createUser('cascade@example.com');
    const role = await prisma.role.create({
      data: { code: 'USER', name: 'Usuario' },
    });
    await prisma.userRole.create({
      data: { userId: user.id, roleId: role.id },
    });
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: 'hash-1',
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    await prisma.user.delete({ where: { id: user.id } });

    expect(await prisma.userRole.count({ where: { userId: user.id } })).toBe(0);
    expect(
      await prisma.refreshToken.count({ where: { userId: user.id } }),
    ).toBe(0);
  });

  it('enforces a unique token hash for refresh tokens', async () => {
    const user = await createUser('tokens@example.com');
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: 'duplicate-hash',
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    await expect(
      prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: 'duplicate-hash',
          expiresAt: new Date(Date.now() + 60_000),
        },
      }),
    ).rejects.toThrow();
  });
});
