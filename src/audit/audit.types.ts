import type { AuditLog } from '@prisma/client';

export interface AuditLogSummary {
  id: string;
  actorUserId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  reason: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface PaginatedAuditLogs {
  items: AuditLogSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export function toAuditLogSummary(entry: AuditLog): AuditLogSummary {
  return {
    id: entry.id,
    actorUserId: entry.actorUserId,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    reason: entry.reason,
    metadata: entry.metadata as Record<string, unknown> | null,
    createdAt: entry.createdAt,
  };
}
