// Conjunto cerrado de eventos que registra esta fase (sección "Eventos de
// compartir y conversión"). `AnalyticsEvent.type` es String en el schema a
// propósito, para que fases futuras (Fase 10) puedan registrar otros tipos
// de evento sin una migración — este union solo acota lo que el módulo de
// sharing puede escribir.
export const ANALYTICS_EVENT_TYPES = {
  SHARE_CREATED: 'SHARE_CREATED',
  SHARE_VIEWED: 'SHARE_VIEWED',
  SHARE_REVOKED: 'SHARE_REVOKED',
  SHARE_SIGNUP: 'SHARE_SIGNUP',
} as const;

export type AnalyticsEventType =
  (typeof ANALYTICS_EVENT_TYPES)[keyof typeof ANALYTICS_EVENT_TYPES];

// Título genérico por tipo de lectura — nunca el título que generó la IA a
// partir de la pregunta privada del usuario (sección "resumen saneado" de la
// Fase 9: el resumen público nunca puede depender de contenido derivado de
// la pregunta).
export const GENERIC_SHARE_TITLES: Record<'TAROT' | 'PALM', string> = {
  TAROT: 'Hice una lectura de tarot en TAROTRIA',
  PALM: 'Hice una lectura de manos en TAROTRIA',
};

export const SHARE_IMAGE_WIDTH_PX = 1080;
export const SHARE_IMAGE_HEIGHT_PX = 1920;
