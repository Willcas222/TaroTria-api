process.env.DATABASE_URL =
  process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { TAROT_THREE_INTERPRETATION_PROMPT } from '../../prisma/seed-data/prompts';

const databaseUrl = process.env.DATABASE_URL as string;
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

async function resetPrompt() {
  const existing = await prisma.prompt.findUnique({
    where: { code: TAROT_THREE_INTERPRETATION_PROMPT.code },
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

async function seedPrompt() {
  const promptSeed = TAROT_THREE_INTERPRETATION_PROMPT;

  const prompt = await prisma.prompt.upsert({
    where: { code: promptSeed.code },
    update: { name: promptSeed.name },
    create: { code: promptSeed.code, name: promptSeed.name },
  });

  const existingVersion = await prisma.promptVersion.findUnique({
    where: {
      promptId_version: { promptId: prompt.id, version: promptSeed.version },
    },
  });

  if (!existingVersion) {
    await prisma.promptVersion.create({
      data: {
        promptId: prompt.id,
        version: promptSeed.version,
        systemPrompt: promptSeed.systemPrompt,
        userPromptTemplate: promptSeed.userPromptTemplate,
        model: promptSeed.model,
        temperature: promptSeed.temperature,
        maxOutputTokens: promptSeed.maxOutputTokens,
        outputSchema: promptSeed.outputSchema as never,
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });
  }

  return prompt;
}

describe('Prompts seed (integration, isolated database)', () => {
  beforeAll(async () => {
    // Only touches the TAROT_THREE_INTERPRETATION prompt — this suite must
    // stay isolated from other integration files that create their own
    // prompts (e.g. the admin prompts CRUD tests).
    await resetPrompt();
    await seedPrompt();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('seeds TAROT_THREE_INTERPRETATION with a single published version', async () => {
    const prompt = await prisma.prompt.findUniqueOrThrow({
      where: { code: 'TAROT_THREE_INTERPRETATION' },
      include: { versions: true },
    });

    expect(prompt.versions).toHaveLength(1);
    expect(prompt.versions[0].status).toBe('PUBLISHED');
    expect(prompt.versions[0].version).toBe(1);
    expect(prompt.versions[0].publishedAt).not.toBeNull();
  });

  it('enforces a unique version number per prompt', async () => {
    const prompt = await prisma.prompt.findUniqueOrThrow({
      where: { code: 'TAROT_THREE_INTERPRETATION' },
    });

    await expect(
      prisma.promptVersion.create({
        data: {
          promptId: prompt.id,
          version: 1,
          systemPrompt: 'dup',
          userPromptTemplate: 'dup',
          model: 'gpt-4o-mini',
          outputSchema: {},
        },
      }),
    ).rejects.toThrow();
  });

  it('re-seeding is idempotent: no duplicate versions are created', async () => {
    await seedPrompt();
    await seedPrompt();

    const prompt = await prisma.prompt.findUniqueOrThrow({
      where: { code: 'TAROT_THREE_INTERPRETATION' },
    });
    const versions = await prisma.promptVersion.count({
      where: { promptId: prompt.id },
    });

    expect(versions).toBe(1);
  });
});
