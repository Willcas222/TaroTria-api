import type { Service, ServiceForm } from '@prisma/client';

export type ServiceWithActiveForm = Service & {
  forms: ServiceForm[];
};

export interface PublicService {
  code: string;
  name: string;
  description: string | null;
  creditCost: number;
  formSchema: unknown | null;
}

export interface AdminService {
  id: string;
  code: string;
  name: string;
  description: string | null;
  creditCost: number;
  isActive: boolean;
  activeFormVersion: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toPublicService(service: ServiceWithActiveForm): PublicService {
  const activeForm = service.forms[0];

  return {
    code: service.code,
    name: service.name,
    description: service.description,
    creditCost: service.creditCost,
    formSchema: activeForm?.schema ?? null,
  };
}

export function toAdminService(service: ServiceWithActiveForm): AdminService {
  const activeForm = service.forms[0];

  return {
    id: service.id,
    code: service.code,
    name: service.name,
    description: service.description,
    creditCost: service.creditCost,
    isActive: service.isActive,
    activeFormVersion: activeForm?.version ?? null,
    createdAt: service.createdAt,
    updatedAt: service.updatedAt,
  };
}
