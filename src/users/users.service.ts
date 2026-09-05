import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { toSafeUser, type SafeUser, type UserWithRoles } from './user.types';

const USER_WITH_ROLES_INCLUDE = {
  userRoles: { include: { role: true } },
} as const;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export interface PaginatedUsers {
  items: SafeUser[];
  total: number;
  page: number;
  pageSize: number;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<UserWithRoles | null> {
    return this.prisma.user.findUnique({
      where: { email: normalizeEmail(email) },
      include: USER_WITH_ROLES_INCLUDE,
    });
  }

  findById(id: string): Promise<UserWithRoles | null> {
    return this.prisma.user.findUnique({
      where: { id },
      include: USER_WITH_ROLES_INCLUDE,
    });
  }

  create(data: {
    email: string;
    name: string;
    passwordHash: string;
  }): Promise<UserWithRoles> {
    return this.prisma.user.create({
      data: {
        email: normalizeEmail(data.email),
        name: data.name,
        passwordHash: data.passwordHash,
      },
      include: USER_WITH_ROLES_INCLUDE,
    });
  }

  async assignRole(userId: string, roleCode: string): Promise<void> {
    const role = await this.prisma.role.findUniqueOrThrow({
      where: { code: roleCode },
    });

    await this.prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId: role.id } },
      update: {},
      create: { userId, roleId: role.id },
    });
  }

  updateProfile(
    userId: string,
    data: { name?: string },
  ): Promise<UserWithRoles> {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
      },
      include: USER_WITH_ROLES_INCLUDE,
    });
  }

  async softDeleteAndRevokeSessions(userId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { status: 'DELETED', deletedAt: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  async listUsers(params: {
    page: number;
    pageSize: number;
  }): Promise<PaginatedUsers> {
    const skip = (params.page - 1) * params.pageSize;

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        skip,
        take: params.pageSize,
        orderBy: { createdAt: 'desc' },
        include: USER_WITH_ROLES_INCLUDE,
      }),
      this.prisma.user.count(),
    ]);

    return {
      items: items.map(toSafeUser),
      total,
      page: params.page,
      pageSize: params.pageSize,
    };
  }
}
