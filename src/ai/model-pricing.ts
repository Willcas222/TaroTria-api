// Precios aproximados en USD por millón de tokens. Son una estimación para
// fines de auditoría interna (AIExecution.costEstimateUsd), no una fuente de
// facturación exacta — revisar contra la tarifa vigente del proveedor.
const MODEL_PRICING_USD_PER_1M_TOKENS: Record<
  string,
  { input: number; output: number }
> = {
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
};

export function estimateCostUsd(
  model: string,
  tokensInput: number,
  tokensOutput: number,
): number | null {
  const pricing = MODEL_PRICING_USD_PER_1M_TOKENS[model];
  if (!pricing) {
    return null;
  }

  return (
    (tokensInput / 1_000_000) * pricing.input +
    (tokensOutput / 1_000_000) * pricing.output
  );
}
