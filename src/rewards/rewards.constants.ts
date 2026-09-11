import type { RewardType } from '@prisma/client';

// Cuántos anuncios completados se requieren para cada desbloqueo (sección 6
// y 7 del documento de publicidad recompensada). Centralizado aquí -- nunca
// hardcodeado en un componente o controlador -- para poder ajustarlo sin
// tocar la lógica central.
export const REWARD_ADS_REQUIRED: Record<RewardType, number> = {
  DAILY_CARD_UNLOCK: 1,
  TAROT_READING_UNLOCK: 5,
  FLASH_OFFER_UNLOCK: 2,
};

// Tiempo que tiene el usuario para completar el anuncio después de crear la
// sesión antes de que se considere expirada (sección 3 y 9: "expiración").
export const REWARD_SESSION_TTL_SECONDS = 10 * 60;

// Límite de ofertas flash promocionales por usuario por día (sección 10 del
// modelo de negocio).
export const FLASH_OFFER_DAILY_LIMIT = 1;
