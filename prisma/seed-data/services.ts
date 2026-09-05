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
    {
      key: 'topic',
      type: 'select',
      label: 'Tema',
      required: true,
      options: ['LOVE', 'WORK', 'MONEY', 'PERSONAL'],
    },
  ],
};
