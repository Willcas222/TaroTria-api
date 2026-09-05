export const DAILY_CARD_CACHE_TTL_SECONDS = 24 * 60 * 60;

export function dailyCardCacheKey(userId: string, date: string): string {
  return `daily-card:${userId}:${date}`;
}

export const DAILY_CARD_DISCLAIMER =
  'Las lecturas tienen fines de entretenimiento, reflexión y orientación personal. No constituyen asesoramiento médico, psicológico, jurídico, financiero ni profesional, ni garantizan acontecimientos futuros.';
