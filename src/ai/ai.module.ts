import { Module } from '@nestjs/common';
import { AiOrchestratorService } from './ai-orchestrator.service';
import { AI_PROVIDER } from './ai-provider.interface';
import { OpenAiProvider } from './openai.provider';
import { PromptsService } from './prompts.service';

@Module({
  providers: [
    OpenAiProvider,
    { provide: AI_PROVIDER, useClass: OpenAiProvider },
    AiOrchestratorService,
    PromptsService,
  ],
  exports: [AI_PROVIDER, AiOrchestratorService, PromptsService],
})
export class AiModule {}
