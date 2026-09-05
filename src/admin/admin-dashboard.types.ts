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
}
