import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { AIExecutionStatus, PromptVersion } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AI_PROVIDER,
  type AIProvider,
  type AIProviderImage,
  type AIProviderResponse,
} from './ai-provider.interface';
import {
  AI_MAX_TECHNICAL_RETRIES,
  AI_REQUEST_TIMEOUT_MS,
} from './ai.constants';
import { containsProhibitedContent } from './guardrails/output-guardrail';
import { detectHighRiskContent } from './guardrails/risk-guardrail';
import { estimateCostUsd } from './model-pricing';
import { AI_TASK_SCHEMAS } from './task-registry';

export interface AIOrchestratorExecuteInput {
  promptVersionId: string;
  readingId?: string;
  variables: Record<string, string>;
  riskCheckText: string;
  images?: AIProviderImage[];
}

export interface AIOrchestratorExecuteResult {
  aiExecutionId: string;
  status: AIExecutionStatus;
  output?: unknown;
  errorMessage?: string;
}

const RISK_GUARDRAIL_MESSAGE =
  'Tu consulta menciona contenido sensible. Por tu bienestar, te invitamos a buscar apoyo profesional; esta herramienta no está diseñada para ese propósito.';
const PROVIDER_FAILURE_MESSAGE =
  'No fue posible generar la interpretación en este momento.';
const QUALITY_FAILURE_MESSAGE =
  'La respuesta generada no cumplió los criterios de calidad y seguridad requeridos.';

@Injectable()
export class AiOrchestratorService {
  private readonly logger = new Logger(AiOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AI_PROVIDER) private readonly provider: AIProvider,
  ) {}

  async execute(
    input: AIOrchestratorExecuteInput,
  ): Promise<AIOrchestratorExecuteResult> {
    const promptVersion = await this.prisma.promptVersion.findUnique({
      where: { id: input.promptVersionId },
      include: { prompt: true },
    });
    if (!promptVersion) {
      throw new NotFoundException(
        `No existe una versión de prompt con id "${input.promptVersionId}".`,
      );
    }

    const schema = AI_TASK_SCHEMAS[promptVersion.prompt.code];
    if (!schema) {
      throw new NotFoundException(
        `No hay un validador de salida registrado para la tarea "${promptVersion.prompt.code}".`,
      );
    }

    if (detectHighRiskContent(input.riskCheckText)) {
      const execution = await this.createExecution({
        promptVersion,
        input,
        status: 'FAILED',
        errorMessage: 'blocked_by_risk_guardrail',
      });
      return {
        aiExecutionId: execution.id,
        status: 'FAILED',
        errorMessage: RISK_GUARDRAIL_MESSAGE,
      };
    }

    const userPrompt = this.interpolate(
      promptVersion.userPromptTemplate,
      input.variables,
    );

    let response: AIProviderResponse | undefined;
    let lastError: unknown;

    for (let attempt = 0; attempt <= AI_MAX_TECHNICAL_RETRIES; attempt += 1) {
      try {
        response = await this.provider.complete({
          systemPrompt: promptVersion.systemPrompt,
          userPrompt,
          model: promptVersion.model,
          temperature: promptVersion.temperature ?? undefined,
          maxOutputTokens: promptVersion.maxOutputTokens ?? undefined,
          timeoutMs: AI_REQUEST_TIMEOUT_MS,
          images: input.images,
        });
        break;
      } catch (error) {
        lastError = error;
        this.logger.warn(
          `AI provider attempt ${attempt + 1} failed: ${(error as Error).message}`,
        );
      }
    }

    if (!response) {
      const execution = await this.createExecution({
        promptVersion,
        input,
        status: 'FAILED',
        errorMessage:
          lastError instanceof Error
            ? lastError.message
            : 'Unknown provider error',
      });
      return {
        aiExecutionId: execution.id,
        status: 'FAILED',
        errorMessage: PROVIDER_FAILURE_MESSAGE,
      };
    }

    return this.handleResponse(promptVersion, input, schema, response);
  }

  private async handleResponse(
    promptVersion: PromptVersion,
    input: AIOrchestratorExecuteInput,
    schema: (typeof AI_TASK_SCHEMAS)[string],
    response: AIProviderResponse,
  ): Promise<AIOrchestratorExecuteResult> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      const execution = await this.createExecution({
        promptVersion,
        input,
        status: 'FAILED',
        errorMessage: 'invalid_json_output',
        response,
      });
      return {
        aiExecutionId: execution.id,
        status: 'FAILED',
        errorMessage: QUALITY_FAILURE_MESSAGE,
      };
    }

    const validation = schema.safeParse(parsed);
    if (!validation.success) {
      const execution = await this.createExecution({
        promptVersion,
        input,
        status: 'FAILED',
        errorMessage: `schema_validation_failed: ${validation.error.message}`,
        response,
      });
      return {
        aiExecutionId: execution.id,
        status: 'FAILED',
        errorMessage: QUALITY_FAILURE_MESSAGE,
      };
    }

    if (containsProhibitedContent(response.content)) {
      const execution = await this.createExecution({
        promptVersion,
        input,
        status: 'FAILED',
        errorMessage: 'blocked_by_output_guardrail',
        response,
      });
      return {
        aiExecutionId: execution.id,
        status: 'FAILED',
        errorMessage: QUALITY_FAILURE_MESSAGE,
      };
    }

    const execution = await this.createExecution({
      promptVersion,
      input,
      status: 'COMPLETED',
      response,
      outputJson: validation.data,
    });

    return {
      aiExecutionId: execution.id,
      status: 'COMPLETED',
      output: validation.data,
    };
  }

  private async createExecution(params: {
    promptVersion: PromptVersion;
    input: AIOrchestratorExecuteInput;
    status: AIExecutionStatus;
    errorMessage?: string;
    response?: AIProviderResponse;
    outputJson?: unknown;
  }) {
    const { promptVersion, input, status, errorMessage, response, outputJson } =
      params;

    return this.prisma.aIExecution.create({
      data: {
        promptVersionId: promptVersion.id,
        readingId: input.readingId,
        provider: this.provider.name,
        model: response?.model ?? promptVersion.model,
        status,
        inputSummary: input.variables as never,
        outputJson:
          outputJson !== undefined ? (outputJson as never) : undefined,
        tokensInput: response?.tokensInput,
        tokensOutput: response?.tokensOutput,
        latencyMs: response?.latencyMs,
        costEstimateUsd:
          response && status === 'COMPLETED'
            ? estimateCostUsd(
                response.model,
                response.tokensInput,
                response.tokensOutput,
              )
            : undefined,
        errorMessage,
      },
    });
  }

  private interpolate(
    template: string,
    variables: Record<string, string>,
  ): string {
    return template.replace(
      /\{\{(\w+)\}\}/g,
      (_match, key: string) => variables[key] ?? '',
    );
  }
}
