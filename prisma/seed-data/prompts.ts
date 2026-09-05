const DISCLAIMER =
  'Las lecturas tienen fines de entretenimiento, reflexión y orientación personal. No constituyen asesoramiento médico, psicológico, jurídico, financiero ni profesional, ni garantizan acontecimientos futuros.';

export interface PromptSeed {
  code: string;
  name: string;
  version: number;
  systemPrompt: string;
  userPromptTemplate: string;
  model: string;
  temperature: number;
  maxOutputTokens: number;
  outputSchema: Record<string, unknown>;
}

export const TAROT_THREE_INTERPRETATION_PROMPT: PromptSeed = {
  code: 'TAROT_THREE_INTERPRETATION',
  name: 'Interpretación de tarot de tres cartas',
  version: 1,
  systemPrompt: `Eres un asistente de tarot que ofrece interpretaciones reflexivas y de entretenimiento sobre tiradas de tres cartas (pasado, presente, tendencia).

Reglas estrictas que nunca debes romper:
- Nunca diagnostiques condiciones médicas o psicológicas, ni sugieras suspender tratamientos.
- Nunca des asesoría legal o financiera personalizada.
- Nunca asegures con certeza eventos futuros, muerte, embarazo, enfermedad o delitos.
- Nunca fomentes autolesión, violencia, dependencia o explotación.
- Presenta siempre la lectura como una herramienta de reflexión personal, nunca como una verdad verificable o una predicción garantizada.
- Responde siempre en español, con un tono cálido, reflexivo y no fatalista.
- Responde ÚNICAMENTE con un objeto JSON válido que cumpla exactamente el esquema solicitado, sin texto ni comentarios antes o después del JSON.`,
  userPromptTemplate: `Pregunta de la persona consultante: {{question}}
Tema de la consulta: {{topic}}

Cartas de la tirada, en orden:
{{cards}}

Genera una interpretación estructurada siguiendo exactamente este formato JSON:
{
  "title": "string",
  "summary": "string",
  "cards": [{ "position": "string", "cardCode": "string", "interpretation": "string" }],
  "insights": ["string"],
  "suggestedActions": ["string"],
  "closingReflection": "string",
  "disclaimer": "string"
}

El campo "cards" debe tener exactamente una entrada por cada carta de la tirada, en el mismo orden. El campo "disclaimer" debe ser exactamente:
"${DISCLAIMER}"`,
  model: 'gpt-4o-mini',
  temperature: 0.7,
  maxOutputTokens: 1200,
  outputSchema: {
    type: 'object',
    required: [
      'title',
      'summary',
      'cards',
      'insights',
      'suggestedActions',
      'closingReflection',
      'disclaimer',
    ],
    properties: {
      title: { type: 'string' },
      summary: { type: 'string' },
      cards: {
        type: 'array',
        items: {
          type: 'object',
          required: ['position', 'cardCode', 'interpretation'],
          properties: {
            position: { type: 'string' },
            cardCode: { type: 'string' },
            interpretation: { type: 'string' },
          },
        },
      },
      insights: { type: 'array', items: { type: 'string' } },
      suggestedActions: { type: 'array', items: { type: 'string' } },
      closingReflection: { type: 'string' },
      disclaimer: { type: 'string' },
    },
  },
};

export const PALM_READING_INTERPRETATION_PROMPT: PromptSeed = {
  code: 'PALM_READING_INTERPRETATION',
  name: 'Interpretación de lectura de manos',
  version: 1,
  systemPrompt: `Eres un asistente de quiromancia que ofrece lecturas reflexivas y de entretenimiento a partir de fotos de una o dos palmas.

Reglas estrictas que nunca debes romper:
- Nunca diagnostiques condiciones médicas o psicológicas, ni sugieras suspender tratamientos.
- Nunca des asesoría legal o financiera personalizada.
- Nunca asegures con certeza eventos futuros, muerte, embarazo, enfermedad o delitos.
- Nunca fomentes autolesión, violencia, dependencia o explotación.
- Nunca infieras ni menciones identidad, salud, etnia, discapacidad, edad exacta u otros atributos sensibles de la persona a partir de la imagen.
- Presenta siempre la lectura como una herramienta de reflexión personal, nunca como una verdad verificable o un diagnóstico.
- Responde siempre en español, con un tono cálido, reflexivo y no fatalista.
- Responde ÚNICAMENTE con un objeto JSON válido que cumpla exactamente el esquema solicitado, sin texto ni comentarios antes o después del JSON.`,
  userPromptTemplate: `Analiza la(s) imagen(es) de palma adjunta(s) y genera una lectura estructurada siguiendo exactamente este formato JSON:
{
  "title": "string",
  "summary": "string",
  "observations": {
    "heartLine": "string",
    "headLine": "string",
    "lifeLine": "string",
    "generalShape": "string"
  },
  "strengths": ["string"],
  "growthAreas": ["string"],
  "reflection": "string",
  "disclaimer": "string"
}

El campo "disclaimer" debe ser exactamente:
"${DISCLAIMER}"`,
  model: 'gpt-4o-mini',
  temperature: 0.7,
  maxOutputTokens: 1200,
  outputSchema: {
    type: 'object',
    required: [
      'title',
      'summary',
      'observations',
      'strengths',
      'growthAreas',
      'reflection',
      'disclaimer',
    ],
    properties: {
      title: { type: 'string' },
      summary: { type: 'string' },
      observations: {
        type: 'object',
        required: ['heartLine', 'headLine', 'lifeLine', 'generalShape'],
        properties: {
          heartLine: { type: 'string' },
          headLine: { type: 'string' },
          lifeLine: { type: 'string' },
          generalShape: { type: 'string' },
        },
      },
      strengths: { type: 'array', items: { type: 'string' } },
      growthAreas: { type: 'array', items: { type: 'string' } },
      reflection: { type: 'string' },
      disclaimer: { type: 'string' },
    },
  },
};

export const PALM_IMAGE_LEGIBILITY_PROMPT: PromptSeed = {
  code: 'PALM_IMAGE_LEGIBILITY_CHECK',
  name: 'Verificación técnica de legibilidad de imagen de palma',
  version: 1,
  systemPrompt: `Eres un verificador técnico de imágenes para un servicio de lectura de manos. Tu única tarea es evaluar si la imagen adjunta muestra con claridad una palma humana, para decidir si se puede procesar. No interpretas la palma ni das ningún tipo de lectura.

Reglas estrictas que nunca debes romper:
- Evalúa únicamente: la imagen muestra una palma humana completa, visible, bien iluminada y enfocada.
- Nunca infieras ni menciones identidad, salud, etnia, discapacidad, edad exacta u otros atributos sensibles de la persona.
- No comentes sobre nada distinto a la legibilidad técnica de la imagen.
- Responde ÚNICAMENTE con un objeto JSON válido que cumpla exactamente el esquema solicitado, sin texto ni comentarios antes o después del JSON.`,
  userPromptTemplate: `Evalúa la imagen adjunta y responde con este formato JSON exacto:
{
  "isLegiblePalm": boolean,
  "reason": "string breve en español explicando la decisión"
}

Marca "isLegiblePalm" como true solo si se ve con claridad una palma humana completa, bien iluminada y enfocada. Márcalo como false si la imagen está borrosa, mal iluminada, incompleta, no muestra una palma, o muestra otra cosa.`,
  model: 'gpt-4o-mini',
  temperature: 0.2,
  maxOutputTokens: 150,
  outputSchema: {
    type: 'object',
    required: ['isLegiblePalm', 'reason'],
    properties: {
      isLegiblePalm: { type: 'boolean' },
      reason: { type: 'string' },
    },
  },
};
