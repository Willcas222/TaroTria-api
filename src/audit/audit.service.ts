import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toAuditLogSummary, type PaginatedAuditLogs } from './audit.types';

type Tx = Prisma.TransactionClient;

export interface RecordAuditLogInput {
  actorUserId: string;
  action: string;
  reason: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  // Acepta un `tx` opcional para que operaciones que deben ser atómicas con
  // el registro de auditoría (p. ej. un ajuste de saldo) puedan componerlo
  // dentro de su propia transacción, igual que WalletService con sus
  // movimientos de ledger.
  async record(input: RecordAuditLogInput, tx?: Tx): Promise<void> {
    const client = tx ?? this.prisma;
    await client.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        action: input.action,
        reason: input.reason,
        targetType: input.targetType,
        targetId: input.targetId,
        metadata: input.metadata as never,
      },
    });
  }

  async listAll(
    page: number,
    pageSize: number,
    filters: { actorUserId?: string; action?: string } = {},
  ): Promise<PaginatedAuditLogs> {
    const where = {
      ...(filters.actorUserId ? { actorUserId: filters.actorUserId } : {}),
      ...(filters.action ? { action: filters.action } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      items: items.map(toAuditLogSummary),
      total,
      page,
      pageSize,
    };
  }
}
