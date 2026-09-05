import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import type { AdminMetrics } from './admin-dashboard.types';

@Injectable()
export class AdminMetricsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  // Agrega en paralelo sobre varias tablas — es un reporte de solo lectura
  // (sección 22: "usuarios, lecturas, ventas, conversión, IA y margen"),
  // nunca se usa para decidir nada transaccional, así que no necesita
  // consistencia transaccional entre sus partes.
  async getMetrics(): Promise<AdminMetrics> {
    const [
      totalUsers,
      readingsGrouped,
      paidOrders,
      usersWithPurchase,
      aiExecutionsCount,
      aiFailuresCount,
      aiCostSum,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.reading.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.order.aggregate({
        where: { status: 'PAID' },
        _sum: { priceCents: true },
        _count: { _all: true },
      }),
      this.prisma.order.findMany({
        where: { status: 'PAID' },
        distinct: ['userId'],
        select: { userId: true },
      }),
      this.prisma.aIExecution.count(),
      this.prisma.aIExecution.count({ where: { status: 'FAILED' } }),
      this.prisma.aIExecution.aggregate({
        _sum: { costEstimateUsd: true },
      }),
    ]);

    const readingsByStatus = Object.fromEntries(
      readingsGrouped.map((row) => [row.status, row._count._all]),
    );

    const revenueCents = paidOrders._sum.priceCents ?? 0;
    const paidOrdersCount = paidOrders._count._all;
    const usersWithAtLeastOnePurchase = usersWithPurchase.length;
    const conversionRate =
      totalUsers > 0 ? usersWithAtLeastOnePurchase / totalUsers : 0;

    const aiCostEstimateUsd = Number(aiCostSum._sum.costEstimateUsd ?? 0);
    const usdToCopRate = this.configService.get<number>(
      'AI_COST_USD_TO_COP_RATE',
    ) as number;
    const aiCostEstimateCents = Math.round(
      aiCostEstimateUsd * usdToCopRate * 100,
    );

    return {
      totalUsers,
      readingsByStatus,
      paidOrdersCount,
      revenueCents,
      currency: 'COP',
      usersWithAtLeastOnePurchase,
      conversionRate,
      aiExecutionsCount,
      aiFailuresCount,
      aiCostEstimateUsd,
      aiCostEstimateCents,
      marginCents: revenueCents - aiCostEstimateCents,
    };
  }
}
