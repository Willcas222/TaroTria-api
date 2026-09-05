import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { PromptsService } from './prompts.service';

const promptContent = {
  systemPrompt: 'system',
  userPromptTemplate: 'template {{question}}',
  model: 'gpt-4o-mini',
  outputSchema: { type: 'object' },
};

describe('PromptsService', () => {
  let service: PromptsService;
  let prisma: {
    prompt: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
    };
    promptVersion: {
      create: jest.Mock;
      findFirst: jest.Mock;
      updateMany: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      prompt: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
      },
      promptVersion: {
        create: jest.fn(),
        findFirst: jest.fn(),
        updateMany: jest.fn().mockReturnValue({}),
        update: jest.fn().mockReturnValue({}),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };

    const module = await Test.createTestingModule({
      providers: [PromptsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(PromptsService);
  });

  describe('create', () => {
    it('throws ConflictException when the code is already taken', async () => {
      prisma.prompt.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.create({ ...promptContent, code: 'DUP', name: 'x' }, 'user-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates the prompt with its first version as DRAFT', async () => {
      prisma.prompt.findUnique
        .mockResolvedValueOnce(null) // uniqueness check
        .mockResolvedValueOnce({
          id: 'prompt-1',
          code: 'NEW',
          name: 'x',
          versions: [],
        }); // findOne after creation
      prisma.prompt.create.mockResolvedValue({ id: 'prompt-1' });

      await service.create(
        { ...promptContent, code: 'NEW', name: 'x' },
        'user-1',
      );

      expect(prisma.promptVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          promptId: 'prompt-1',
          version: 1,
          status: 'DRAFT',
          authorId: 'user-1',
        }),
      });
    });
  });

  describe('createVersion', () => {
    it('throws NotFoundException when the prompt does not exist', async () => {
      prisma.prompt.findUnique.mockResolvedValue(null);

      await expect(
        service.createVersion('missing', promptContent, 'user-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('increments the version number based on the last existing version', async () => {
      prisma.prompt.findUnique.mockResolvedValueOnce({ id: 'prompt-1' });
      prisma.promptVersion.findFirst.mockResolvedValue({ version: 3 });
      prisma.prompt.findUnique.mockResolvedValueOnce({
        id: 'prompt-1',
        code: 'X',
        name: 'x',
        versions: [],
      });

      await service.createVersion('prompt-1', promptContent, 'user-1');

      expect(prisma.promptVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ version: 4, status: 'DRAFT' }),
      });
    });
  });

  describe('publish', () => {
    it('throws BadRequestException when there is no draft to publish', async () => {
      prisma.promptVersion.findFirst.mockResolvedValue(null);

      await expect(service.publish('prompt-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('archives the previously published version and publishes the latest draft', async () => {
      prisma.promptVersion.findFirst.mockResolvedValue({
        id: 'version-2',
        version: 2,
      });
      prisma.prompt.findUnique.mockResolvedValue({
        id: 'prompt-1',
        code: 'X',
        name: 'x',
        versions: [],
      });

      await service.publish('prompt-1');

      expect(prisma.$transaction).toHaveBeenCalledWith([
        expect.anything(),
        expect.anything(),
      ]);
      expect(prisma.promptVersion.updateMany).toHaveBeenCalledWith({
        where: { promptId: 'prompt-1', status: 'PUBLISHED' },
        data: { status: 'ARCHIVED' },
      });
      expect(prisma.promptVersion.update).toHaveBeenCalledWith({
        where: { id: 'version-2' },
        data: { status: 'PUBLISHED', publishedAt: expect.any(Date) },
      });
    });
  });

  describe('resolveVersionForTest', () => {
    it('returns the explicit version id when it belongs to the prompt', async () => {
      prisma.promptVersion.findFirst.mockResolvedValue({ id: 'version-9' });

      const result = await service.resolveVersionForTest(
        'prompt-1',
        'version-9',
      );

      expect(result).toBe('version-9');
      expect(prisma.promptVersion.findFirst).toHaveBeenCalledWith({
        where: { id: 'version-9', promptId: 'prompt-1' },
      });
    });

    it('throws NotFoundException when the explicit version does not belong to the prompt', async () => {
      prisma.promptVersion.findFirst.mockResolvedValue(null);

      await expect(
        service.resolveVersionForTest('prompt-1', 'not-mine'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('falls back to the latest version when none is specified', async () => {
      prisma.promptVersion.findFirst.mockResolvedValue({
        id: 'version-latest',
      });

      const result = await service.resolveVersionForTest('prompt-1');

      expect(result).toBe('version-latest');
      expect(prisma.promptVersion.findFirst).toHaveBeenCalledWith({
        where: { promptId: 'prompt-1' },
        orderBy: { version: 'desc' },
      });
    });

    it('throws NotFoundException when the prompt has no versions at all', async () => {
      prisma.promptVersion.findFirst.mockResolvedValue(null);

      await expect(
        service.resolveVersionForTest('prompt-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
