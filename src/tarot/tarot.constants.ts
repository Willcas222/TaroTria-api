export const DEFAULT_TAROT_DECK_CODE = 'RIDER_WAITE_ES';

export const TAROT_DECK_CACHE_TTL_SECONDS = 60 * 60;

export function tarotDeckCacheKey(code: string): string {
  return `tarot:deck:${code}`;
}
