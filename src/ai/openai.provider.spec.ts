const createMock = jest.fn();

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: createMock } },
  })),
}));

import type { ConfigService } from '@nestjs/config';
import { OpenAiProvider } from './openai.provider';

describe('OpenAiProvider', () => {
  let provider: OpenAiProvider;
  let configService: { get: jest.Mock };

  beforeEach(() => {
    createMock.mockReset();
    configService = { get: jest.fn().mockReturnValue('sk-test-key') };
    provider = new OpenAiProvider(configService as unknown as ConfigService);
  });

  it('sends the system and user prompts and maps the response', async () => {
    createMock.mockResolvedValue({
      model: 'gpt-4o-mini',
      choices: [{ message: { content: '{"foo":"bar"}' } }],
      usage: { prompt_tokens: 10, completion_tokens: 20 },
    });

    const result = await provider.complete({
      systemPrompt: 'system prompt',
      userPrompt: 'user prompt',
      model: 'gpt-4o-mini',
      timeoutMs: 5000,
    });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'system prompt' },
          { role: 'user', content: 'user prompt' },
        ],
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result).toEqual({
      content: '{"foo":"bar"}',
      model: 'gpt-4o-mini',
      tokensInput: 10,
      tokensOutput: 20,
      latencyMs: expect.any(Number),
    });
  });

  it('sends the images as data URIs alongside the text prompt when provided', async () => {
    createMock.mockResolvedValue({
      model: 'gpt-4o-mini',
      choices: [{ message: { content: '{"isLegiblePalm":true}' } }],
      usage: { prompt_tokens: 100, completion_tokens: 10 },
    });

    await provider.complete({
      systemPrompt: 'system prompt',
      userPrompt: 'user prompt',
      model: 'gpt-4o-mini',
      timeoutMs: 5000,
      images: [{ base64: 'ZmFrZQ==', mimeType: 'image/jpeg' }],
    });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: 'system', content: 'system prompt' },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'user prompt' },
              {
                type: 'image_url',
                image_url: { url: 'data:image/jpeg;base64,ZmFrZQ==' },
              },
            ],
          },
        ],
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('throws when OpenAI returns no content', async () => {
    createMock.mockResolvedValue({
      model: 'gpt-4o-mini',
      choices: [{ message: { content: null } }],
      usage: { prompt_tokens: 1, completion_tokens: 0 },
    });

    await expect(
      provider.complete({
        systemPrompt: 'system',
        userPrompt: 'user',
        model: 'gpt-4o-mini',
        timeoutMs: 5000,
      }),
    ).rejects.toThrow('OpenAI no devolvió contenido.');
  });

  it('propagates errors from the SDK, such as network failures or timeouts', async () => {
    createMock.mockRejectedValue(new Error('network down'));

    await expect(
      provider.complete({
        systemPrompt: 'system',
        userPrompt: 'user',
        model: 'gpt-4o-mini',
        timeoutMs: 5000,
      }),
    ).rejects.toThrow('network down');
  });
});
