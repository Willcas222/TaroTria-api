// Precios en pesos colombianos, sin subunidad real de centavos en uso —
// priceCents sigue el formato que exige la API de Wompi (amount_in_cents),
// por eso es el precio en COP multiplicado por 100.
//
// Estructura según el modelo de negocio de TAROTRIA (sección 6 y 7): 3
// paquetes con efecto de anclaje (el más caro primero) y efecto señuelo (el
// intermedio, PRO_ASTRAL, destacado como "RECOMENDADO"). Los montos en USD
// del documento original ($29.99 / $11.99 / $3.99) se llevaron a COP a una
// tasa de referencia de ~4.000 COP/USD, redondeados a cifras típicas de
// Wompi.
export const CREDIT_PACKAGES = [
  {
    code: 'ENTERPRISE_MISTICO',
    name: 'Enterprise · Místico',
    description: '100 créditos + 30 de regalo. El paquete de referencia para quienes viven la experiencia TAROTRIA a fondo.',
    credits: 130,
    priceCents: 12_000_000,
    currency: 'COP',
    isRecommended: false,
  },
  {
    code: 'PRO_ASTRAL',
    name: 'Pro · Astral',
    description: '40 créditos + 10 de regalo. La mejor relación entre créditos y precio.',
    credits: 50,
    priceCents: 4_800_000,
    currency: 'COP',
    isRecommended: true,
  },
  {
    code: 'BASICO_FUEGO',
    name: 'Básico · Fuego',
    description: '10 créditos, ideal para una experiencia puntual.',
    credits: 10,
    priceCents: 1_600_000,
    currency: 'COP',
    isRecommended: false,
  },
] as const;
