import { Injectable, NotFoundException } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  toAdminService,
  toPublicService,
  type AdminService,
  type PublicService,
  type ServiceWithActiveForm,
} from './service.types';
import {
  SERVICES_LIST_CACHE_KEY,
  SERVICES_LIST_CACHE_TTL_SECONDS,
} from './services.constants';

const ACTIVE_FORM_INCLUDE = {
  forms: {
    where: { isActive: true },
    orderBy: { version: 'desc' as const },
    take: 1,
  },
} as const;

@Injectable()
export class ServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async listActive(): Promise<PublicService[]> {
    const cached = await this.cache.get<PublicService[]>(
      SERVICES_LIST_CACHE_KEY,
    );
    if (cached) {
      return cached;
    }

    const services = await this.prisma.service.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
      include: ACTIVE_FORM_INCLUDE,
    });

    const result = services.map(toPublicService);
    await this.cache.set(
      SERVICES_LIST_CACHE_KEY,
      result,
      SERVICES_LIST_CACHE_TTL_SECONDS,
    );
    return result;
  }

  async findActiveByCode(code: string): Promise<PublicService> {
    const service = await this.prisma.service.findFirst({
      where: { code, isActive: true },
      include: ACTIVE_FORM_INCLUDE,
    });

    if (!service) {
      throw new NotFoundException('Servicio no encontrado.');
    }

    return toPublicService(service);
  }

  async listAll(): Promise<AdminService[]> {
    const services = await this.prisma.service.findMany({
      orderBy: { createdAt: 'asc' },
      include: ACTIVE_FORM_INCLUDE,
    });

    return services.map(toAdminService);
  }

  async update(
    id: string,
    data: {
      name?: string;
      description?: string | null;
      creditCost?: number;
      isActive?: boolean;
    },
  ): Promise<AdminService> {
    const existing = await this.prisma.service.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Servicio no encontrado.');
    }

    const updated = (await this.prisma.service.update({
      where: { id },
      data,
      include: ACTIVE_FORM_INCLUDE,
    })) as ServiceWithActiveForm;

    await this.cache.del(SERVICES_LIST_CACHE_KEY);
    return toAdminService(updated);
  }

  async publishForm(serviceId: string, schema: unknown): Promise<AdminService> {
    const service = await this.prisma.service.findUnique({
      where: { id: serviceId },
    });
    if (!service) {
      throw new NotFoundException('Servicio no encontrado.');
    }

    const lastForm = await this.prisma.serviceForm.findFirst({
      where: { serviceId },
      orderBy: { version: 'desc' },
    });
    const nextVersion = (lastForm?.version ?? 0) + 1;

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.serviceForm.updateMany({
        where: { serviceId, isActive: true },
        data: { isActive: false },
      });

      await tx.serviceForm.create({
        data: {
          serviceId,
          version: nextVersion,
          schema: schema as never,
          isActive: true,
        },
      });

      return tx.service.findUniqueOrThrow({
        where: { id: serviceId },
        include: ACTIVE_FORM_INCLUDE,
      });
    });

    await this.cache.del(SERVICES_LIST_CACHE_KEY);
    return toAdminService(updated);
  }
}
