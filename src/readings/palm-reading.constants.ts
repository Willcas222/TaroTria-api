// Mapeo por convención (mismo patrón que TarotSpread.code/Prompt.code): el
// código del servicio determina cuántas imágenes de palma se exigen antes de
// poder enviar la lectura.
const PALM_SERVICE_IMAGE_SLOTS: Record<string, number> = {
  PALM_BASIC: 1,
  PALM_COMPLETE: 2,
};

export function isPalmService(serviceCode: string): boolean {
  return serviceCode in PALM_SERVICE_IMAGE_SLOTS;
}

export function requiredPalmImageSlots(serviceCode: string): number {
  return PALM_SERVICE_IMAGE_SLOTS[serviceCode] ?? 0;
}
