export interface TarotSpreadPositionSeed {
  code: string;
  label: string;
  orderIndex: number;
}

export interface TarotSpreadSeed {
  code: string;
  name: string;
  positions: TarotSpreadPositionSeed[];
}

// El code coincide a propósito con el code del Service (`TAROT_THREE`):
// es el mapeo por convención que usa ReadingsService para resolver qué
// tirada corresponde a un servicio, sin modelar todavía una relación
// formal Service -> TarotSpread (solo existe un caso de uso hoy).
export const TAROT_SPREADS: TarotSpreadSeed[] = [
  {
    code: 'TAROT_THREE',
    name: 'Pasado, presente y tendencia',
    positions: [
      { code: 'PAST', label: 'Pasado', orderIndex: 0 },
      { code: 'PRESENT', label: 'Presente', orderIndex: 1 },
      { code: 'TREND', label: 'Tendencia', orderIndex: 2 },
    ],
  },
];
