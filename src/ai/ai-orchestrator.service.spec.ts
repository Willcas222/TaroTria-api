import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AiOrchestratorService } from './ai-orchestrator.service';
import { AI_PROVIDER } from './ai-provider.interface';
import { TAROT_INTERPRETATION_TASK } from './tasks/tarot-interpretation.schema';

const VALID_OUTPUT = {
  title: 'Un nuevo comienzo',
  summary: 'Resumen breve.',
  cards: [
    { position: 'PAST', cardCode: 'THE_FOOL', interpretation: 'x' },
    { position: 'PRESENT', cardCode: 'THE_MAGICIAN', interpretation: 'y' },
    { position: 'TREND', cardCode: 'THE_WORLD', interpretation: 'z' },
  ],
  insights: ['insight uno'],
  suggestedActions: ['acción uno'],
  closingReflection: 'reflexión final',
  disclaimer: 'disclaimer',
};

const promptVersionWithPrompt = {
  id: 'version-1',
  promptId: 'prompt-1',
  version: 1,
  systemPrompt: 'system',
  userPromptTemplate: 'Pregunta: {{question}} / Tema: {{topic}}',
  model: 'gpt-4o-mini',
  temperature: 0.7,
  maxOutputTokens: 1200,
  outputSchema: {},
  status: 'PUBLISHED' as const,
  authorId: null,
  publishedAt: new Date(),
  createdAt: new Date(),
  prompt: { id: 'prompt-1', code: TAROT_INTERPRETATION_TASK, name: 'x' },
};

describe('AiOrchestratorService', () => {
  let service: AiOrchestratorService;
  let prisma: {
    promptVersion: { findUnique: jest.Mock };
    aIExecution: { create: jest.Mock };
  };
  let provider: { name: string; complete: jest.Mock };

  beforeEach(async () => {
    prisma = {
      promptVersion: { findUnique: jest.fn() },
      aIExecution: {
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'execution-1', ...data }),
          ),
      },
    };
    provider = { name: 'openai', complete: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        AiOrchestratorService,
        { provide: PrismaService, useValue: prisma },
        { provide: AI_PROVIDER, useValue: provider },
      ],
    }).compile();

    service = module.get(AiOrchestratorService);

    prisma.promptVersion.findUnique.mockResolvedValue(promptVersionWithPrompt);
  });

  it('throws NotFoundException when the prompt version does not exist', async () => {
    prisma.promptVersion.findUnique.mockResolvedValue(null);

    await expect(
      service.execute({
        promptVersionId: 'missing',
        variables: {},
        riskCheckText: '',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws NotFoundException when the prompt task has no registered output schema', async () => {
    prisma.promptVersion.findUnique.mockResolvedValue({
      ...promptVersionWithPrompt,
      prompt: { id: 'prompt-2', code: 'UNKNOWN_TASK', name: 'x' },
    });

    await expect(
      service.execute({
        promptVersionId: 'version-1',
        variables: {},
        riskCheckText: '',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('blocks the request and never calls the provider when the input is high risk', async () => {
    const result = await service.execute({
      promptVersionId: 'version-1',
      variables: { question: 'x' },
      riskCheckText: 'quiero quitarme la vida',
    });

    expect(provider.complete).not.toHaveBeenCalled();
    expect(result.status).toBe('FAILED');
    expect(prisma.aIExecution.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          errorMessage: 'blocked_by_risk_guardrail',
        }),
      }),
    );
  });

  it('interpolates the user prompt template with the given variables', async () => {
    provider.complete.mockResolvedValue({
      content: JSON.stringify(VALID_OUTPUT),
      model: 'gpt-4o-mini',
      tokensInput: 100,
      tokensOutput: 200,
      latencyMs: 50,
    });

    await service.execute({
      promptVersionId: 'version-1',
      variables: { question: '¿Qué me depara?', topic: 'WORK' },
      riskCheckText: '¿Qué me depara?',
    });

    expect(provider.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        userPrompt: 'Pregunta: ¿Qué me depara? / Tema: WORK',
      }),
    );
  });

  it('retries technical failures and succeeds once the provider recovers', async () => {
    provider.complete
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({
        content: JSON.stringify(VALID_OUTPUT),
        model: 'gpt-4o-mini',
        tokensInput: 100,
        tokensOutput: 200,
        latencyMs: 50,
      });

    const result = await service.execute({
      promptVersionId: 'version-1',
      variables: {},
      riskCheckText: '',
    });

    expect(provider.complete).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('COMPLETED');
  });

  it('gives up after exhausting all technical retries and records the failure', async () => {
    provider.complete.mockRejectedValue(new Error('network down'));

    const result = await service.execute({
      promptVersionId: 'version-1',
      variables: {},
      riskCheckText: '',
    });

    expect(provider.complete).toHaveBeenCalledTimes(3); // 1 + AI_MAX_TECHNICAL_RETRIES(2)
    expect(result.status).toBe('FAILED');
    expect(prisma.aIExecution.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ errorMessage: 'network down' }),
      }),
    );
  });

  it('fails when the provider returns content that is not valid JSON', async () => {
    provider.complete.mockResolvedValue({
      content: 'not json at all',
      model: 'gpt-4o-mini',
      tokensInput: 10,
      tokensOutput: 5,
      latencyMs: 20,
    });

    const result = await service.execute({
      promptVersionId: 'version-1',
      variables: {},
      riskCheckText: '',
    });

    expect(result.status).toBe('FAILED');
    expect(prisma.aIExecution.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ errorMessage: 'invalid_json_output' }),
      }),
    );
  });

  it('fails when the JSON output does not match the expected schema', async () => {
    provider.complete.mockResolvedValue({
      content: JSON.stringify({ foo: 'bar' }),
      model: 'gpt-4o-mini',
      tokensInput: 10,
      tokensOutput: 5,
      latencyMs: 20,
    });

    const result = await service.execute({
      promptVersionId: 'version-1',
      variables: {},
      riskCheckText: '',
    });

    expect(result.status).toBe('FAILED');
    expect(prisma.aIExecution.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          errorMessage: expect.stringContaining('schema_validation_failed'),
        }),
      }),
    );
  });

  it('fails when the output contains guardrail-prohibited content', async () => {
    provider.complete.mockResolvedValue({
      content: JSON.stringify({
        ...VALID_OUTPUT,
        summary: 'Es seguro que ocurrirá algo terrible.',
      }),
      model: 'gpt-4o-mini',
      tokensInput: 10,
      tokensOutput: 5,
      latencyMs: 20,
    });

    const result = await service.execute({
      promptVersionId: 'version-1',
      variables: {},
      riskCheckText: '',
    });

    expect(result.status).toBe('FAILED');
    expect(prisma.aIExecution.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          errorMessage: 'blocked_by_output_guardrail',
        }),
      }),
    );
  });

  it('completes successfully, persists the execution and estimates its cost', async () => {
    provider.complete.mockResolvedValue({
      content: JSON.stringify(VALID_OUTPUT),
      model: 'gpt-4o-mini',
      tokensInput: 1_000_000,
      tokensOutput: 1_000_000,
      latencyMs: 500,
    });

    const result = await service.execute({
      promptVersionId: 'version-1',
      readingId: 'reading-1',
      variables: { question: 'x' },
      riskCheckText: 'x',
    });

    expect(result.status).toBe('COMPLETED');
    expect(result.output).toEqual(VALID_OUTPUT);
    expect(prisma.aIExecution.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        promptVersionId: 'version-1',
        readingId: 'reading-1',
        provider: 'openai',
        model: 'gpt-4o-mini',
        status: 'COMPLETED',
        outputJson: VALID_OUTPUT,
        tokensInput: 1_000_000,
        tokensOutput: 1_000_000,
        latencyMs: 500,
        costEstimateUsd: 0.15 + 0.6,
      }),
    });
  });
});
