// Detección heurística básica de contenido de alto riesgo (crisis, autolesión)
// en la entrada del usuario, para cortar antes de invocar al proveedor de IA.
// Es un filtro de palabras clave, no un clasificador real; ampliarlo o
// reemplazarlo por un servicio dedicado queda fuera del alcance del MVP.
const HIGH_RISK_PATTERNS = [
  /suicid/i,
  /matarme/i,
  /quitarme la vida/i,
  /autolesi[oó]n/i,
  /hacerme da[ñn]o/i,
  /no quiero vivir/i,
  /quiero morir/i,
];

export function detectHighRiskContent(text: string): boolean {
  return HIGH_RISK_PATTERNS.some((pattern) => pattern.test(text));
}
