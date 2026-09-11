import type { RewardSession, RewardType } from '@prisma/client';

export interface RewardSessionSummary {
  id: string;
  rewardType: RewardType;
  provider: string;
  status: string;
  expiresAt: string;
}

export function toRewardSessionSummary(
  session: RewardSession,
): RewardSessionSummary {
  return {
    id: session.id,
    rewardType: session.rewardType,
    provider: session.provider,
    status: session.status,
    expiresAt: session.expiresAt.toISOString(),
  };
}

export interface RewardProgressSummary {
  rewardType: RewardType;
  currentCount: number;
  requiredCount: number;
  unlocked: boolean;
}

// Analítica mínima de la sección 10 del documento. `type` es texto libre
// (igual que sharing.constants.ts) para no requerir una migración por cada
// evento nuevo.
export const REWARD_ANALYTICS_EVENTS = {
  AD_REQUESTED: 'ad_requested',
  AD_COMPLETED: 'ad_completed',
  REWARD_GRANTED: 'reward_granted',
  REWARD_REJECTED: 'reward_rejected',
  REWARD_SESSION_EXPIRED: 'reward_session_expired',
} as const;
