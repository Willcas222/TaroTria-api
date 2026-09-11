export const BASE_SERVICES = [
  {
    code: 'DAILY_CARD',
    name: 'Carta diaria',
    description: 'Una carta e interpretación distinta cada día, sin costo.',
    creditCost: 0,
  },
  {
    code: 'TAROT_THREE',
    name: 'Tarot de tres cartas',
    description: 'Pasado, presente y tendencia a partir de tu pregunta.',
    creditCost: 10,
  },
  {
    code: 'TAROT_FIVE',
    name: 'Tarot de cinco cartas',
    description: 'Lectura de profundidad intermedia: situación, desafío, pasado, futuro y resultado.',
    creditCost: 18,
  },
  {
    code: 'TAROT_TEN',
    name: 'Tarot de diez cartas (Cruz Celta)',
    description: 'Lectura profunda y detallada para consultas complejas.',
    creditCost: 35,
  },
  {
    code: 'PALM_BASIC',
    name: 'Lectura de una palma',
    description: 'Reporte guiado a partir de la foto de una sola palma.',
    creditCost: 15,
  },
  {
    code: 'PALM_COMPLETE',
    name: 'Lectura de dos palmas',
    description: 'Reporte guiado a partir de la foto de ambas palmas.',
    creditCost: 25,
  },
] as const;

// Sin campo de "tema": la IA detecta sola la intención de la consulta a
// partir del texto de la pregunta (sección 15 del modelo de negocio —
// reduce fricción, no obliga a categorizar antes de preguntar).
export const TAROT_THREE_FORM_SCHEMA = {
  version: 1,
  fields: [
    {
      key: 'question',
      type: 'textarea',
      label: '¿Qué quieres consultar?',
      required: true,
      minLength: 5,
      maxLength: 500,
    },
  ],
};
