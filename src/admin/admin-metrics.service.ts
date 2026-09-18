import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RewardType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  AdminMetrics,
  RewardFunnelMetrics,
  TarotDepthBreakdownEntry,
} from './admin-dashboard.types';

const TAROT_SERVICE_CODES = ['TAROT_THREE', 'TAROT_FIVE', 'TAROT_TEN'];
const REWARD_TYPES: RewardType[] = [
  'DAILY_CARD_UNLOCK',
  'TAROT_READING_UNLOCK',
  'FLASH_OFFER_UNLOCK',
];

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
      tarotDepthBreakdown,
      avgCardsPerReading,
      avgCreditsPerTarotReading,
      totalTarotReadings,
      rewardFunnel,
      adToPurchaseConversionRate,
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
      this.getTarotDepthBreakdown(),
      this.getAvgCardsPerReading(),
      this.getAvgCreditsPerTarotReading(),
      this.prisma.reading.count({
        where: { service: { code: { in: TAROT_SERVICE_CODES } } },
      }),
      this.getRewardFunnel(),
      this.getAdToPurchaseConversionRate(),
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
      tarotDepthBreakdown,
      avgCardsPerReading,
      avgCreditsPerTarotReading,
      readingsPerUser: totalUsers > 0 ? totalTarotReadings / totalUsers : 0,
      rewardFunnel,
      adToPurchaseConversionRate,
    };
  }

  // Sección 24 del documento de tiradas: "porcentaje de usuarios que eligen
  // 3/5/10 cartas". Prisma no agrupa directamente por un campo de una
  // relación, así que se agrupa por serviceId y se traduce a code con el
  // pequeño catálogo de servicios de tarot (nunca son más de 3 filas).
  private async getTarotDepthBreakdown(): Promise<TarotDepthBreakdownEntry[]> {
    const tarotServices = await this.prisma.service.findMany({
      where: { code: { in: TAROT_SERVICE_CODES } },
      select: { id: true, code: true },
    });
    const codeById = new Map(tarotServices.map((s) => [s.id, s.code]));

    const grouped = await this.prisma.reading.groupBy({
      by: ['serviceId'],
      where: { serviceId: { in: tarotServices.map((s) => s.id) } },
      _count: { _all: true },
    });

    const total = grouped.reduce((sum, row) => sum + row._count._all, 0);

    return grouped
      .map((row) => ({
        code: codeById.get(row.serviceId) ?? row.serviceId,
        readingsCount: row._count._all,
        percentage: total > 0 ? row._count._all / total : 0,
      }))
      .sort(
        (a, b) =>
          TAROT_SERVICE_CODES.indexOf(a.code) -
          TAROT_SERVICE_CODES.indexOf(b.code),
      );
  }

  // Sección 12 del modelo de negocio, literal: "debe calcularse la media
  // ponderada de cartas consultadas por sesión". Sumar todas las cartas
  // tiradas y dividir por el número de lecturas con tirada ya pondera
  // automáticamente por la mezcla real de 3/5/10 cartas que la gente elige,
  // sin tener que hardcodear el tamaño de cada tirada aquí.
  private async getAvgCardsPerReading(): Promise<number> {
    const [totalDraws, readingsWithDraws] = await Promise.all([
      this.prisma.tarotDraw.count(),
      this.prisma.reading.count({ where: { draws: { some: {} } } }),
    ]);

    return readingsWithDraws > 0 ? totalDraws / readingsWithDraws : 0;
  }

  // Sección 24 del documento de tiradas: "consumo promedio de tokens por
  // lectura". Se toma directamente del ledger de créditos (RESERVATION),
  // que ya es la fuente de verdad del costo real cobrado -- incluye
  // correctamente las lecturas gratis por publicidad como $0.
  private async getAvgCreditsPerTarotReading(): Promise<number> {
    const result = await this.prisma.walletTransaction.aggregate({
      where: {
        type: 'RESERVATION',
        reading: { service: { code: { in: TAROT_SERVICE_CODES } } },
      },
      _sum: { amount: true },
      _count: { _all: true },
    });

    const totalCredits = Math.abs(result._sum.amount ?? 0);
    return result._count._all > 0 ? totalCredits / result._count._all : 0;
  }

  // Sección 11 del documento de publicidad recompensada: "Impressions,
  // Completed Rewards, Reward Completion Rate". RewardSession ya es el
  // registro de cada "impresión" real que el backend autorizó -- no hace
  // falta un evento de analítica aparte para contarlas.
  private async getRewardFunnel(): Promise<RewardFunnelMetrics> {
    const [createdGrouped, completedGrouped] = await Promise.all([
      this.prisma.rewardSession.groupBy({
        by: ['rewardType'],
        _count: { _all: true },
      }),
      this.prisma.rewardSession.groupBy({
        by: ['rewardType'],
        where: { status: 'COMPLETED' },
        _count: { _all: true },
      }),
    ]);

    const createdByType = new Map(
      createdGrouped.map((row) => [row.rewardType, row._count._all]),
    );
    const completedByType = new Map(
      completedGrouped.map((row) => [row.rewardType, row._count._all]),
    );

    const byType: RewardFunnelMetrics['byType'] = {};
    let sessionsCreated = 0;
    let sessionsCompleted = 0;

    for (const rewardType of REWARD_TYPES) {
      const created = createdByType.get(rewardType) ?? 0;
      const completed = completedByType.get(rewardType) ?? 0;
      sessionsCreated += created;
      sessionsCompleted += completed;
      byType[rewardType] = {
        sessionsCreated: created,
        sessionsCompleted: completed,
        completionRate: created > 0 ? completed / created : 0,
      };
    }

    return {
      sessionsCreated,
      sessionsCompleted,
      completionRate:
        sessionsCreated > 0 ? sessionsCompleted / sessionsCreated : 0,
      byType,
    };
  }

  // Sección 24 del documento de tiradas: "Publicidad -> compra de tokens".
  // Proxy razonable sin necesidad de un evento de conversión dedicado: qué
  // fracción de quienes alguna vez ganaron una recompensa por publicidad
  // también compraron al menos un paquete de créditos.
  private async getAdToPurchaseConversionRate(): Promise<number> {
    const [rewardedUserIds, purchasedUserIds] = await Promise.all([
      this.prisma.rewardTransaction.findMany({
        distinct: ['userId'],
        select: { userId: true },
      }),
      this.prisma.order.findMany({
        where: { status: 'PAID' },
        distinct: ['userId'],
        select: { userId: true },
      }),
    ]);

    if (rewardedUserIds.length === 0) {
      return 0;
    }

    const purchasedSet = new Set(purchasedUserIds.map((o) => o.userId));
    const rewardedWhoPurchased = rewardedUserIds.filter((r) =>
      purchasedSet.has(r.userId),
    ).length;

    return rewardedWhoPurchased / rewardedUserIds.length;
  }
}
