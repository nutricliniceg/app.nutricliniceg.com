import { aiProviderRepository, aiKeyRepository } from '@/lib/db/repositories/ai.repo';
import { decryptSecret } from './vault';
import { adapterRegistry } from './chain';
import { DEFAULT_MODEL } from './types';
import { DEFAULT_TIMEOUT_MS } from './adapters/http';

export interface ProbeOutcome {
  providerId: string;
  ok: boolean;
  latencyMs: number;
  detail: string;
}

// CRON-09 probe (wired in P29): tiny completion per enabled provider.
// Success clears failure_count; failure increments it (AI-09).
export async function probeProvider(providerId: string): Promise<ProbeOutcome> {
  const started = Date.now();
  const provider = await aiProviderRepository.findById(providerId);
  if (!provider || !provider.is_enabled) {
    return { providerId, ok: false, latencyMs: Date.now() - started, detail: 'Provider missing or disabled' };
  }
  const adapter = adapterRegistry[provider.type];
  if (!adapter) {
    return { providerId, ok: false, latencyMs: Date.now() - started, detail: 'No adapter for provider type' };
  }
  // Probe with a real key (tiny completion). Keyless providers are skipped,
  // never failed — absence of a key is a config state, not an outage.
  const keys = await aiKeyRepository.listActiveByProvider(providerId);
  if (keys.length === 0) {
    return { providerId, ok: true, latencyMs: Date.now() - started, detail: 'Skipped: no active keys' };
  }
  let apiKey = '';
  try {
    apiKey = decryptSecret(keys[0].key_encrypted);
  } catch {
    return { providerId, ok: false, latencyMs: Date.now() - started, detail: 'Key vault decrypt failed' };
  }
  try {
    await adapter({
      providerType: provider.type,
      baseUrl: provider.base_url,
      apiKey,
      model: DEFAULT_MODEL[provider.type],
      messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
      maxTokens: 16,
      timeoutMs: Math.min(DEFAULT_TIMEOUT_MS, 15_000),
      jsonMode: false,
    });
    await aiProviderRepository.probeResult(providerId, true);
    return { providerId, ok: true, latencyMs: Date.now() - started, detail: 'Probe succeeded' };
  } catch (err) {
    const detail = err instanceof Error ? err.message.slice(0, 300) : 'Probe failed';
    try {
      await aiProviderRepository.probeResult(providerId, false);
    } catch {
      // Bookkeeping failure must not mask the probe outcome.
    }
    return { providerId, ok: false, latencyMs: Date.now() - started, detail };
  }
}

export async function probeAllProviders(): Promise<ProbeOutcome[]> {
  const providers = await aiProviderRepository.listChain();
  const outcomes: ProbeOutcome[] = [];
  for (const p of providers) {
    outcomes.push(await probeProvider(p.id));
  }
  return outcomes;
}
