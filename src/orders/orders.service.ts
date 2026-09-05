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

    const order = await this.prisma.order.create({
      data: {
        userId,
        creditPackageId: pkg.id,
        credits: pkg.credits,
        priceCents: pkg.priceCents,
        currency: pkg.currency,
        status: 'PENDING',
      },
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
