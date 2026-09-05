import OpenAI from 'openai';
import type { ChatCompletionContentPart } from 'openai/resources/chat/completions/completions';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AIProvider,
  AIProviderRequest,
  AIProviderResponse,
} from './ai-provider.interface';

@Injectable()
export class OpenAiProvider implements AIProvider {
  readonly name = 'openai';
  private readonly client: OpenAI;

  constructor(private readonly configService: ConfigService) {
    this.client = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  async complete(request: AIProviderRequest): Promise<AIProviderResponse> {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), request.timeoutMs);

    const userContent: string | ChatCompletionContentPart[] = request.images
      ?.length
      ? [
          { type: 'text', text: request.userPrompt },
          ...request.images.map((image): ChatCompletionContentPart => ({
            type: 'image_url',
            image_url: {
              url: `data:${image.mimeType};base64,${image.base64}`,
            },
          })),
        ]
      : request.userPrompt;

    try {
      const response = await this.client.chat.completions.create(
        {
          model: request.model,
          temperature: request.temperature,
          max_tokens: request.maxOutputTokens,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: request.systemPrompt },
            { role: 'user', content: userContent },
          ],
        },
        { signal: controller.signal },
      );

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('OpenAI no devolvió contenido.');
      }

      return {
        content,
        model: response.model,
        tokensInput: response.usage?.prompt_tokens ?? 0,
        tokensOutput: response.usage?.completion_tokens ?? 0,
        latencyMs: Date.now() - startedAt,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
