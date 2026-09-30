import { scrubPhi } from '@/lib/errors/errors.service';
import type { AiUsageInsert } from '@/lib/db/repositories/ai.repo';
import { aiUsageRepository } from '@/lib/db/repositories/ai.repo';

// AI-08: every AI call inserts an AiUsageLog row. Error text is PHI-scrubbed;
// token counts fall back to a ~4-chars-per-token estimate when the provider
// omits usage (never trust, always record something sane).
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export async function logUsage(entry: AiUsageInsert): Promise<void> {
  const clean: AiUsageInsert = {
    ...entry,
    promptTokens: Math.max(0, Math.floor(entry.promptTokens)),
    completionTokens: Math.max(0, Math.floor(entry.completionTokens)),
    errorMessage: entry.errorMessage ? scrubPhi(entry.errorMessage) : null,
  };
  try {
    await aiUsageRepository.insert(clean);
  } catch {
    // Usage logging must never break the clinical call path (OBS debt: P29 alerting).
  }
}
