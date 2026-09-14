import { Injectable, NotFoundException } from '@nestjs/common';
import { CreditPackagesService } from '../credit-packages/credit-packages.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  toAdminOrderSummary,
  toOrderSummary,
  type OrderSummary,
  type PaginatedOrders,
} from './order.types';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly creditPackagesService: CreditPackagesService,
  ) {}

  // El precio y los créditos se congelan aquí, copiados del paquete en este
  // instante (sección 15 del plan) — un cambio de precio posterior nunca
  // afecta órdenes ya creadas.
  async create(userId: string, packageCode: string): Promise<OrderSummary> {
    const pkg = await this.creditPackagesService.findActiveByCode(packageCode);

    const order = await this.prisma.$transaction(async (tx) => {
      let priceCents = pkg.priceCents;
      let discountAppliedPercent: number | null = null;

      // Sección 10 del modelo de negocio: si el usuario tiene una oferta
      // flash activa para exactamente este paquete, se aplica y se consume
      // aquí -- nunca antes (para no perderla si el usuario abandona el
      // checkout) ni después (para que jamás se pueda reutilizar). El
      // `updateMany` condicionado a `consumedAt: null` es lo que la hace
      // segura ante dos compras concurrentes con la misma oferta, igual que
      // RewardsService#tryConsumeUnlock.
      const activeOffer = await tx.flashOfferUnlock.findFirst({
        where: {
          userId,
          packageCode,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (activeOffer) {
        const consumed = await tx.flashOfferUnlock.updateMany({
          where: { id: activeOffer.id, consumedAt: null },
          data: { consumedAt: new Date() },
        });

        if (consumed.count > 0) {
          discountAppliedPercent = activeOffer.discountPercent;
          priceCents = Math.round(
            (pkg.priceCents * (100 - activeOffer.discountPercent)) / 100,
          );
        }
      }

      return tx.order.create({
        data: {
          userId,
          creditPackageId: pkg.id,
          credits: pkg.credits,
          priceCents,
          discountAppliedPercent,
          currency: pkg.currency,
          status: 'PENDING',
        },
      });
    });

    return toOrderSummary(order);
  }

  async findOneForUser(userId: string, orderId: string): Promise<OrderSummary> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
    });
    if (!order) {
      throw new NotFoundException('Orden no encontrada.');
    }
    return toOrderSummary(order);
  }

  async listAll(page: number, pageSize: number): Promise<PaginatedOrders> {
    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.order.count(),
    ]);

    return {
      items: items.map(toAdminOrderSummary),
      total,
      page,
      pageSize,
    };
  }
}
