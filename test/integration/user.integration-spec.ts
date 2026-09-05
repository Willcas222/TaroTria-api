import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const databaseUrl =
  process.env.DATABASE_URL_TEST ??
  'postgresql://oracle:oracle@localhost:5432/oracle_api_test?schema=public';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

describe('User (integration, isolated database)', () => {
  beforeEach(async () => {
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates a user with the default ACTIVE status', async () => {
    const user = await prisma.user.create({
      data: {
        email: 'integration@example.com',
        name: 'Test User',
        passwordHash: 'hash',
      },
    });

    expect(user.id).toBeDefined();
    expect(user.status).toBe('ACTIVE');
    expect(user.deletedAt).toBeNull();
  });

  it('enforces a unique email constraint', async () => {
    await prisma.user.create({
      data: {
        email: 'dup@example.com',
        name: 'Test User',
        passwordHash: 'hash',
      },
    });

    await expect(
      prisma.user.create({
        data: {
          email: 'dup@example.com',
          name: 'Test User',
          passwordHash: 'hash',
        },
      }),
    ).rejects.toThrow();
  });

  it('bumps updatedAt when a user is modified', async () => {
    const created = await prisma.user.create({
      data: {
        email: 'update@example.com',
        name: 'Test User',
        passwordHash: 'hash',
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    const updated = await prisma.user.update({
      where: { id: created.id },
      data: { status: 'BLOCKED' },
    });

    expect(updated.status).toBe('BLOCKED');
    expect(updated.updatedAt.getTime()).toBeGreaterThan(
      created.updatedAt.getTime(),
    );
  });
});
