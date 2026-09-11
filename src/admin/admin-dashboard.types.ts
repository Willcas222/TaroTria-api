import type { AIExecution, AIExecutionStatus } from '@prisma/client';

export interface AdminAiExecutionSummary {
  id: string;
  readingId: string | null;
  provider: string;
  model: string;
  status: AIExecutionStatus;
  tokensInput: number | null;
  tokensOutput: number | null;
  latencyMs: number | null;
  costEstimateUsd: number | null;
  errorMessage: string | null;
  createdAt: Date;
}

export interface PaginatedAdminAiExecutions {
  items: AdminAiExecutionSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export function toAdminAiExecutionSummary(
  execution: AIExecution,
): AdminAiExecutionSummary {
  return {
    id: execution.id,
    readingId: execution.readingId,
    provider: execution.provider,
    model: execution.model,
    status: execution.status,
    tokensInput: execution.tokensInput,
    tokensOutput: execution.tokensOutput,
    latencyMs: execution.latencyMs,
    costEstimateUsd: execution.costEstimateUsd
      ? Number(execution.costEstimateUsd)
      : null,
    errorMessage: execution.errorMessage,
    createdAt: execution.createdAt,
  };
}

// Adopción de cada profundidad de tirada (sección 24 del documento de
// tiradas: "porcentaje de usuarios que eligen 3/5/10 cartas").
export interface TarotDepthBreakdownEntry {
  code: string;
  readingsCount: number;
  percentage: number;
}

// Embudo de publicidad recompensada (sección 11 del documento de ads:
// "Impressions, Completed Rewards, Reward Completion Rate...").
export interface RewardTypeFunnel {
  sessionsCreated: number;
  sessionsCompleted: number;
  completionRate: number;
}

export interface RewardFunnelMetrics {
  sessionsCreated: number;
  sessionsCompleted: number;
  completionRate: number;
  byType: Record<string, RewardTypeFunnel>;
}

export interface AdminMetrics {
  totalUsers: number;
  readingsByStatus: Record<string, number>;
  paidOrdersCount: number;
  revenueCents: number;
  currency: string;
  usersWithAtLeastOnePurchase: number;
  conversionRate: number;
  aiExecutionsCount: number;
  aiFailuresCount: number;
  aiCostEstimateUsd: number;
  aiCostEstimateCents: number;
  marginCents: number;
  // Sección 12 del modelo de negocio y sección 24 del documento de tiradas.
  tarotDepthBreakdown: TarotDepthBreakdownEntry[];
  avgCardsPerReading: number;
  avgCreditsPerTarotReading: number;
  readingsPerUser: number;
  rewardFunnel: RewardFunnelMetrics;
  // % de usuarios que vieron al menos un anuncio Y compraron al menos un
  // paquete de créditos (sección 24: "Publicidad -> compra de tokens").
  adToPurchaseConversionRate: number;
}
