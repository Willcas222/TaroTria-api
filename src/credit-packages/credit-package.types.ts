import type { CreditPackage } from '@prisma/client';

export interface CreditPackageSummary {
  code: string;
  name: string;
  description: string | null;
  credits: number;
  priceCents: number;
  currency: string;
}

export function toCreditPackageSummary(
  pkg: CreditPackage,
): CreditPackageSummary {
  return {
    code: pkg.code,
    name: pkg.name,
    description: pkg.description,
    credits: pkg.credits,
    priceCents: pkg.priceCents,
    currency: pkg.currency,
  };
}
