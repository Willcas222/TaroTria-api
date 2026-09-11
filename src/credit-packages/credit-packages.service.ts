import { Injectable, NotFoundException } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CREDIT_PACKAGES_LIST_CACHE_KEY,
  CREDIT_PACKAGES_LIST_CACHE_TTL_SECONDS,
} from './credit-packages.constants';
import {
  toCreditPackageSummary,
  type CreditPackageSummary,
} from './credit-package.types';

@Injectable()
export class CreditPackagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async listActive(): Promise<CreditPackageSummary[]> {
    const cached = await this.cache.get<CreditPackageSummary[]>(
      CREDIT_PACKAGES_LIST_CACHE_KEY,
    );
    if (cached) {
      return cached;
    }

    // Orden descendente por precio (sección 7 del modelo de negocio: efecto
    // de anclaje — mostrar primero el paquete de mayor valor establece una
    // referencia alta para que los siguientes se perciban más accesibles).
    const packages = await this.prisma.creditPackage.findMany({
      where: { isActive: true },
      orderBy: { priceCents: 'desc' },
    });

    const result = packages.map(toCreditPackageSummary);
    await this.cache.set(
      CREDIT_PACKAGES_LIST_CACHE_KEY,
      result,
      CREDIT_PACKAGES_LIST_CACHE_TTL_SECONDS,
    );
    return result;
  }

  async findActiveByCode(code: string) {
    const pkg = await this.prisma.creditPackage.findFirst({
      where: { code, isActive: true },
    });
    if (!pkg) {
      throw new NotFoundException('Paquete de créditos no encontrado.');
    }
    return pkg;
  }
}
