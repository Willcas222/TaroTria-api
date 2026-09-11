export const DAILY_CARD_CACHE_TTL_SECONDS = 24 * 60 * 60;

// Sección 2 del modelo de negocio: gratis sin publicidad durante los
// primeros 5 días de la cuenta; a partir del día 6 requiere 1 anuncio
// recompensado (ver REWARD_ADS_REQUIRED.DAILY_CARD_UNLOCK).
export const DAILY_CARD_FREE_DAYS = 5;

export function dailyCardCacheKey(userId: string, date: string): string {
  return `daily-card:${userId}:${date}`;
}

export const DAILY_CARD_DISCLAIMER =
  'Las lecturas tienen fines de entretenimiento, reflexión y orientación personal. No constituyen asesoramiento médico, psicológico, jurídico, financiero ni profesional, ni garantizan acontecimientos futuros.';
