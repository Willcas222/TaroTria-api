// Filtro heurístico contra los puntos prohibidos de la sección 12 del plan
// (diagnósticos médicos/psicológicos, asesoría legal/financiera personalizada,
// garantías de eventos futuros). Igual que el guardrail de entrada, es un
// filtro de patrones, no un revisor de contenido real.
const PROHIBITED_OUTPUT_PATTERNS = [
  /tienes\s+(c[aá]ncer|depresi[oó]n|una enfermedad)/i,
  /(debes|deber[ií]as)\s+(dejar|suspender)\s+tu\s+tratamiento/i,
  /te\s+recomiendo\s+(invertir|demandar|denunciar)/i,
  /vas\s+a\s+morir/i,
  /es\s+seguro\s+que\s+(vas a|ocurrir[aá])/i,
  /(garantizo|te garantizo|con toda certeza)\s+que/i,
];

export function containsProhibitedContent(text: string): boolean {
  return PROHIBITED_OUTPUT_PATTERNS.some((pattern) => pattern.test(text));
}
