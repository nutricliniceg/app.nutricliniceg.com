// AI entry point. P10 callers import from here; P12 adds the quota-aware
// chain factory while keeping the mock seam for tests/offline use.
import type { AiClient } from './types';
import { MockAiClient } from './mock';
import { ChainAiClient, type ChainOptions } from './chain';

// Sync back-compat seam: deterministic mock, no network, no DB.
export function getAiClient(): AiClient {
  return new MockAiClient();
}

function isMockMode(): boolean {
  return process.env.AI_MOCK === 'true' || process.env.NODE_ENV === 'test';
}

// Quota-aware factory: chain with fallback when providers are configured,
// mock when running tests/offline or explicitly flagged.
export async function getAiClientForDoctor(doctorId: string, opts?: Omit<ChainOptions, 'doctorId'>): Promise<AiClient> {
  if (isMockMode()) return new MockAiClient();
  return new ChainAiClient({ doctorId, ...opts });
}
