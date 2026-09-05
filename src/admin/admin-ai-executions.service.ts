import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  toAdminAiExecutionSummary,
  type PaginatedAdminAiExecutions,
} from './admin-dashboard.types';

@Injectable()
export class AdminAiExecutionsService {
  constructor(private readonly prisma: PrismaService) {}

  async listAll(
    page: number,
    pageSize: number,
    status?: 'PENDING' | 'COMPLETED' | 'FAILED',
  ): Promise<PaginatedAdminAiExecutions> {
    const where = status ? { status } : {};

    const [items, total] = await Promise.all([
      this.prisma.aIExecution.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.aIExecution.count({ where }),
    ]);

    return {
      items: items.map(toAdminAiExecutionSummary),
      total,
      page,
      pageSize,
    };
  }
}
