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
  // Cruz de 5 cartas: tirada estándar de profundidad intermedia (situación,
  // desafío, pasado, futuro y resultado).
  {
    code: 'TAROT_FIVE',
    name: 'Cruz de cinco cartas',
    positions: [
      { code: 'SITUATION', label: 'Situación', orderIndex: 0 },
      { code: 'CHALLENGE', label: 'Desafío', orderIndex: 1 },
      { code: 'PAST', label: 'Pasado', orderIndex: 2 },
      { code: 'FUTURE', label: 'Futuro', orderIndex: 3 },
      { code: 'OUTCOME', label: 'Resultado', orderIndex: 4 },
    ],
  },
  // Cruz Celta: la tirada de 10 cartas más reconocida y estándar del tarot,
  // usada tal cual (no es una interpretación propia de posiciones).
  {
    code: 'TAROT_TEN',
    name: 'Cruz Celta',
    positions: [
      { code: 'PRESENT', label: 'Presente', orderIndex: 0 },
      { code: 'CHALLENGE', label: 'Desafío', orderIndex: 1 },
      { code: 'FOUNDATION', label: 'Base', orderIndex: 2 },
      { code: 'RECENT_PAST', label: 'Pasado reciente', orderIndex: 3 },
      { code: 'GOAL', label: 'Meta consciente', orderIndex: 4 },
      { code: 'NEAR_FUTURE', label: 'Futuro cercano', orderIndex: 5 },
      { code: 'ATTITUDE', label: 'Tu actitud', orderIndex: 6 },
      { code: 'ENVIRONMENT', label: 'Entorno', orderIndex: 7 },
      { code: 'HOPES_FEARS', label: 'Esperanzas y miedos', orderIndex: 8 },
      { code: 'OUTCOME', label: 'Resultado final', orderIndex: 9 },
    ],
  },
];
