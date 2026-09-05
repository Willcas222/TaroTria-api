import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { CreatePromptDto } from '../ai/dto/create-prompt.dto';
import { CreatePromptVersionDto } from '../ai/dto/create-prompt-version.dto';
import { PublishPromptDto } from '../ai/dto/publish-prompt.dto';
import { TestPromptDto } from '../ai/dto/test-prompt.dto';
import { PromptsService } from '../ai/prompts.service';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/prompts')
export class AdminPromptsController {
  constructor(
    private readonly promptsService: PromptsService,
    private readonly aiOrchestrator: AiOrchestratorService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  async list() {
    return { prompts: await this.promptsService.listAll() };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return { prompt: await this.promptsService.findOne(id) };
  }

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePromptDto,
  ) {
    const { reason, ...data } = dto;
    const prompt = await this.promptsService.create(data, user.id);
    await this.auditService.record({
      actorUserId: user.id,
      action: 'prompt.create',
      targetType: 'Prompt',
      targetId: prompt.id,
      reason,
    });
    return { prompt };
  }

  @Patch(':id')
  async createVersion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreatePromptVersionDto,
  ) {
    const { reason, ...data } = dto;
    const prompt = await this.promptsService.createVersion(id, data, user.id);
    await this.auditService.record({
      actorUserId: user.id,
      action: 'prompt.create_version',
      targetType: 'Prompt',
      targetId: id,
      reason,
    });
    return { prompt };
  }

  @Post(':id/publish')
  async publish(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: PublishPromptDto,
  ) {
    const prompt = await this.promptsService.publish(id);
    await this.auditService.record({
      actorUserId: user.id,
      action: 'prompt.publish',
      targetType: 'Prompt',
      targetId: id,
      reason: dto.reason,
    });
    return { prompt };
  }

  @Post(':id/test')
  async test(@Param('id') id: string, @Body() dto: TestPromptDto) {
    const promptVersionId = await this.promptsService.resolveVersionForTest(
      id,
      dto.promptVersionId,
    );
    const riskCheckText = Object.values(dto.variables).join(' ');

    const result = await this.aiOrchestrator.execute({
      promptVersionId,
      variables: dto.variables,
      riskCheckText,
    });

    return { result };
  }
}
