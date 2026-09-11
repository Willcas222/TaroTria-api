import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { CREDIT_PACKAGES } from './seed-data/credit-packages';
import { BASE_SERVICES, TAROT_THREE_FORM_SCHEMA } from './seed-data/services';
import {
  TAROT_CARDS,
  TAROT_DECK_CODE,
  TAROT_DECK_NAME,
} from './seed-data/tarot-cards';
import { TAROT_SPREADS } from './seed-data/tarot-spreads';
import {
  PALM_IMAGE_LEGIBILITY_PROMPT,
  PALM_READING_INTERPRETATION_PROMPT,
  TAROT_FIVE_INTERPRETATION_PROMPT,
  TAROT_TEN_INTERPRETATION_PROMPT,
  TAROT_THREE_INTERPRETATION_PROMPT,
  type PromptSeed,
} from './seed-data/prompts';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const BASE_ROLES = [
  { code: 'USER', name: 'Usuario' },
  { code: 'ADMIN', name: 'Administrador' },
] as const;

async function seedRoles() {
  for (const role of BASE_ROLES) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: { name: role.name },
      create: role,
    });
  }
}

async function seedServices() {
  for (const service of BASE_SERVICES) {
    const upserted = await prisma.service.upsert({
      where: { code: service.code },
      update: {
        name: service.name,
        description: service.description,
        creditCost: service.creditCost,
      },
      create: service,
    });

    if (['TAROT_THREE', 'TAROT_FIVE', 'TAROT_TEN'].includes(service.code)) {
      const existingForm = await prisma.serviceForm.findFirst({
        where: { serviceId: upserted.id },
      });

      if (!existingForm) {
        await prisma.serviceForm.create({
          data: {
            serviceId: upserted.id,
            version: 1,
            schema: TAROT_THREE_FORM_SCHEMA,
            isActive: true,
          },
        });
      }
    }
  }
}

async function seedTarotDeck() {
  const deck = await prisma.tarotDeck.upsert({
    where: { code: TAROT_DECK_CODE },
    update: { name: TAROT_DECK_NAME },
    create: { code: TAROT_DECK_CODE, name: TAROT_DECK_NAME },
  });

  for (const card of TAROT_CARDS) {
    await prisma.tarotCard.upsert({
      where: { deckId_code: { deckId: deck.id, code: card.code } },
      update: {
        name: card.name,
        arcana: card.arcana,
        suit: card.suit,
        numberInSuit: card.numberInSuit,
        orderIndex: card.orderIndex,
        uprightMeaning: card.uprightMeaning,
        reversedMeaning: card.reversedMeaning,
      },
      create: {
        deckId: deck.id,
        code: card.code,
        name: card.name,
        arcana: card.arcana,
        suit: card.suit,
        numberInSuit: card.numberInSuit,
        orderIndex: card.orderIndex,
        uprightMeaning: card.uprightMeaning,
        reversedMeaning: card.reversedMeaning,
      },
    });
  }
}

async function seedTarotSpreads() {
  for (const spread of TAROT_SPREADS) {
    const upserted = await prisma.tarotSpread.upsert({
      where: { code: spread.code },
      update: { name: spread.name },
      create: { code: spread.code, name: spread.name },
    });

    for (const position of spread.positions) {
      await prisma.tarotSpreadPosition.upsert({
        where: {
          spreadId_code: { spreadId: upserted.id, code: position.code },
        },
        update: { label: position.label, orderIndex: position.orderIndex },
        create: {
          spreadId: upserted.id,
          code: position.code,
          label: position.label,
          orderIndex: position.orderIndex,
        },
      });
    }
  }
}

async function seedPrompt(promptSeed: PromptSeed) {
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
}

async function seedPrompts() {
  await seedPrompt(TAROT_THREE_INTERPRETATION_PROMPT);
  await seedPrompt(TAROT_FIVE_INTERPRETATION_PROMPT);
  await seedPrompt(TAROT_TEN_INTERPRETATION_PROMPT);
  await seedPrompt(PALM_IMAGE_LEGIBILITY_PROMPT);
  await seedPrompt(PALM_READING_INTERPRETATION_PROMPT);
}

async function seedCreditPackages() {
  for (const pkg of CREDIT_PACKAGES) {
    await prisma.creditPackage.upsert({
      where: { code: pkg.code },
      update: {
        name: pkg.name,
        description: pkg.description,
        credits: pkg.credits,
        priceCents: pkg.priceCents,
        currency: pkg.currency,
        isRecommended: pkg.isRecommended,
        isActive: true,
      },
      create: pkg,
    });
  }
}

async function seedLocalDevUser() {
  const user = await prisma.user.upsert({
    where: { email: 'dev@oracle.local' },
    update: {},
    create: {
      email: 'dev@oracle.local',
      name: 'Dev User',
      passwordHash: 'local-dev-fixture-not-a-real-hash',
      status: 'ACTIVE',
    },
  });

  const userRole = await prisma.role.findUniqueOrThrow({
    where: { code: 'USER' },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: userRole.id } },
    update: {},
    create: { userId: user.id, roleId: userRole.id },
  });
}

async function main() {
  // Los roles, servicios y el mazo de tarot son catálogo base: deben existir
  // en todos los ambientes.
  await seedRoles();
  await seedServices();
  await seedTarotDeck();
  await seedTarotSpreads();
  await seedPrompts();
  await seedCreditPackages();

  if (process.env.NODE_ENV === 'local') {
    await seedLocalDevUser();
  } else {
    console.log('Skipping local dev fixtures outside the local environment.');
  }

  console.log('Seed completed.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
