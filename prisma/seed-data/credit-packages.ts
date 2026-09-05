// Precios en pesos colombianos, sin subunidad real de centavos en uso —
// priceCents sigue el formato que exige la API de Wompi (amount_in_cents),
// por eso es el precio en COP multiplicado por 100.
export const CREDIT_PACKAGES = [
  {
    code: 'ESENCIAL',
    name: 'Esencial',
    description: '50 créditos y acceso a tu historial completo.',
    credits: 50,
    priceCents: 1_990_000,
    currency: 'COP',
  },
  {
    code: 'PREMIUM',
    name: 'Premium',
    description: '120 créditos con prioridad y contenido exclusivo.',
    credits: 120,
    priceCents: 3_990_000,
    currency: 'COP',
  },
] as const;
