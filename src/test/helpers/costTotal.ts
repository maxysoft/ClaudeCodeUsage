import { calculateCostBreakdown, TokenUsage } from '../../pricing';

export function calculateCostFromTokens(tokens: TokenUsage, modelName: string | undefined, atMs?: number): number {
  const parts = calculateCostBreakdown(tokens, modelName, atMs);
  return parts.input + parts.output + parts.cacheWrite + parts.cacheRead;
}
