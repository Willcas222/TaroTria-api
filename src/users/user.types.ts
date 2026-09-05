import type { Role, User, UserRole } from '@prisma/client';

export type UserWithRoles = User & {
  userRoles: (UserRole & { role: Role })[];
};

export interface SafeUser {
  id: string;
  email: string;
  name: string;
  status: string;
  emailVerifiedAt: Date | null;
  roles: string[];
  createdAt: Date;
}

export function toSafeUser(user: UserWithRoles): SafeUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    status: user.status,
    emailVerifiedAt: user.emailVerifiedAt,
    roles: user.userRoles.map((userRole) => userRole.role.code),
    createdAt: user.createdAt,
  };
}
