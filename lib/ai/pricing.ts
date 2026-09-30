import { settingsRepository } from '@/lib/db/repositories/settings.repo';

// AI-08: per-model prices in USD per 1M tokens, overridable at runtime via
// SystemSettings key `ai.price_table` (partial overrides merge over defaults).
export interface ModelPrice {
  in: number;
  out: number;
}

const DEFAULT_PRICE_TABLE: Record<string, ModelPrice> = {
  'gpt-4o-mini': { in: 0.15, out: 0.6 },
  'gpt-4o': { in: 2.5, out: 10 },
  'gemini-2.0-flash': { in: 0.1, out: 0.4 },
  'gemini-1.5-pro': { in: 1.25, out: 5 },
  'claude-3-5-haiku-latest': { in: 0.8, out: 4 },
  'claude-3-5-sonnet-latest': { in: 3, out: 15 },
  default: { in: 1, out: 3 },
};

export async function getPriceTable(): Promise<Record<string, ModelPrice>> {
  try {
    const override = await settingsRepository.get<Record<string, ModelPrice>>('ai.price_table');
    if (override && typeof override === 'object') return { ...DEFAULT_PRICE_TABLE, ...override };
  } catch {
    // Settings unavailable (tests/offline) — fall back to baked-in defaults.
  }
  return { ...DEFAULT_PRICE_TABLE };
}

export function priceFor(table: Record<string, ModelPrice>, model: string): ModelPrice {
  return table[model] ?? table.default;
}

export function estimateCost(table: Record<string, ModelPrice>, model: string, promptTokens: number, completionTokens: number): number {
  const price = priceFor(table, model);
  const cost = (promptTokens * price.in + completionTokens * price.out) / 1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}
