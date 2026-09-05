import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { toAdminPrompt, type AdminPrompt } from './prompt.types';

const WITH_VERSIONS = {
  versions: { orderBy: { version: 'desc' as const } },
} as const;

interface PromptVersionContent {
  systemPrompt: string;
  userPromptTemplate: string;
  model: string;
  temperature?: number;
  maxOutputTokens?: number;
  outputSchema: Record<string, unknown>;
}

@Injectable()
export class PromptsService {
  constructor(private readonly prisma: PrismaService) {}

  async listAll(): Promise<AdminPrompt[]> {
    const prompts = await this.prisma.prompt.findMany({
      include: WITH_VERSIONS,
      orderBy: { createdAt: 'asc' },
    });

    return prompts.map(toAdminPrompt);
  }

  async findOne(id: string): Promise<AdminPrompt> {
    const prompt = await this.prisma.prompt.findUnique({
      where: { id },
      include: WITH_VERSIONS,
    });
    if (!prompt) {
      throw new NotFoundException('Prompt no encontrado.');
    }

    return toAdminPrompt(prompt);
  }

  async create(
    dto: PromptVersionContent & { code: string; name: string },
    authorId: string,
  ): Promise<AdminPrompt> {
    const existing = await this.prisma.prompt.findUnique({
      where: { code: dto.code },
    });
    if (existing) {
      throw new ConflictException('Ya existe un prompt con ese code.');
    }

    const created = await this.prisma.prompt.create({
      data: { code: dto.code, name: dto.name },
    });

    await this.prisma.promptVersion.create({
      data: {
        promptId: created.id,
        version: 1,
        systemPrompt: dto.systemPrompt,
        userPromptTemplate: dto.userPromptTemplate,
        model: dto.model,
        temperature: dto.temperature,
        maxOutputTokens: dto.maxOutputTokens,
        outputSchema: dto.outputSchema as never,
        status: 'DRAFT',
        authorId,
      },
    });

    return this.findOne(created.id);
  }

  async createVersion(
    id: string,
    dto: PromptVersionContent,
    authorId: string,
  ): Promise<AdminPrompt> {
    const prompt = await this.prisma.prompt.findUnique({ where: { id } });
    if (!prompt) {
      throw new NotFoundException('Prompt no encontrado.');
    }

    const lastVersion = await this.prisma.promptVersion.findFirst({
      where: { promptId: id },
      orderBy: { version: 'desc' },
    });
    const nextVersion = (lastVersion?.version ?? 0) + 1;

    await this.prisma.promptVersion.create({
      data: {
        promptId: id,
        version: nextVersion,
        systemPrompt: dto.systemPrompt,
        userPromptTemplate: dto.userPromptTemplate,
        model: dto.model,
        temperature: dto.temperature,
        maxOutputTokens: dto.maxOutputTokens,
        outputSchema: dto.outputSchema as never,
        status: 'DRAFT',
        authorId,
      },
    });

    return this.findOne(id);
  }

  async publish(id: string): Promise<AdminPrompt> {
    const lastDraft = await this.prisma.promptVersion.findFirst({
      where: { promptId: id, status: 'DRAFT' },
      orderBy: { version: 'desc' },
    });
    if (!lastDraft) {
      throw new BadRequestException(
        'No hay una versión en borrador para publicar.',
      );
    }

    await this.prisma.$transaction([
      this.prisma.promptVersion.updateMany({
        where: { promptId: id, status: 'PUBLISHED' },
        data: { status: 'ARCHIVED' },
      }),
      this.prisma.promptVersion.update({
        where: { id: lastDraft.id },
        data: { status: 'PUBLISHED', publishedAt: new Date() },
      }),
    ]);

    return this.findOne(id);
  }

  async resolveVersionForTest(
    promptId: string,
    explicitVersionId?: string,
  ): Promise<string> {
    if (explicitVersionId) {
      const version = await this.prisma.promptVersion.findFirst({
        where: { id: explicitVersionId, promptId },
      });
      if (!version) {
        throw new NotFoundException(
          'La versión indicada no pertenece a este prompt.',
        );
      }
      return version.id;
    }

    const lastVersion = await this.prisma.promptVersion.findFirst({
      where: { promptId },
      orderBy: { version: 'desc' },
    });
    if (!lastVersion) {
      throw new NotFoundException('Este prompt todavía no tiene versiones.');
    }

    return lastVersion.id;
  }

  async getPublishedVersionId(code: string): Promise<string> {
    const prompt = await this.prisma.prompt.findUnique({ where: { code } });
    if (!prompt) {
      throw new NotFoundException(`No existe un prompt con code "${code}".`);
    }

    const version = await this.prisma.promptVersion.findFirst({
      where: { promptId: prompt.id, status: 'PUBLISHED' },
      orderBy: { version: 'desc' },
    });
    if (!version) {
      throw new NotFoundException(
        `El prompt "${code}" no tiene una versión publicada.`,
      );
    }

    return version.id;
  }
}
