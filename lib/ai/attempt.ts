import type { AdapterFn, ChatMessage, ChatOptions, ChatResult } from './types';
import { DEFAULT_MODEL } from './types';
import { DEFAULT_TIMEOUT_MS } from './adapters/http';
import { aiProviderRepository, aiKeyRepository, type AiProvider } from '@/lib/db/repositories/ai.repo';
import { decryptSecret } from './vault';
import { estimateCost } from './pricing';
import { logUsage, estimateTokens } from './usage';
import { FAILURE_THRESHOLD, DISABLE_COOLDOWN_MS } from './chain-limits';

export interface AttemptContext {
  doctorId: string | null;
  requestType: string;
  priceTable: Record<string, { in: number; out: number }>;
  adapter: AdapterFn;
}

export interface ProviderAttempt {
  provider: AiProvider;
  keyId: string;
  result: ChatResult;
  model: string;
  elapsedMs: number;
}

// Single-provider attempt: decrypt key in memory only, call the adapter,
// then record success/failure bookkeeping + usage. Throws on failure so the
// chain can move to the next provider (AI-09).
export async function attemptProvider(
  provider: AiProvider,
  messages: ChatMessage[],
  opts: ChatOptions,
  images: Array<{ bytes: Uint8Array; mime: string }>,
  ctx: AttemptContext
): Promise<ProviderAttempt> {
  const keys = await aiKeyRepository.listActiveByProvider(provider.id);
  if (keys.length === 0) throw new Error(`No active keys for provider ${provider.name}`);
  const key = keys[0];
  const started = Date.now();
  const model = opts.model ?? DEFAULT_MODEL[provider.type];
  try {
    const raw = await ctx.adapter({
      providerType: provider.type,
      baseUrl: provider.base_url,
      apiKey: decryptSecret(key.key_encrypted),
      model,
      messages,
      images,
      maxTokens: opts.maxTokens ?? 2000,
      timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      jsonMode: false,
    });
    const elapsed = Date.now() - started;
    const promptTokens = raw.promptTokens > 0 ? raw.promptTokens : estimateTokens(messages.map((m) => m.content).join('\n'));
    const completionTokens = raw.completionTokens > 0 ? raw.completionTokens : estimateTokens(raw.text);
    await aiProviderRepository.recordSuccess(provider.id);
    try {
      await aiKeyRepository.touchUsed(key.id);
    } catch {
      // Key timestamp bookkeeping is non-critical.
    }
    await logUsage({
      providerId: provider.id,
      apiKeyId: key.id,
      doctorId: ctx.doctorId,
      model,
      promptTokens,
      completionTokens,
      estimatedCost: estimateCost(ctx.priceTable, model, promptTokens, completionTokens),
      responseTimeMs: elapsed,
      success: true,
      errorMessage: null,
      requestType: opts.requestType ?? ctx.requestType,
    });
    return { provider, keyId: key.id, result: { ...raw, promptTokens, completionTokens, model }, model, elapsedMs: elapsed };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Provider call failed';
    const failures = provider.failure_count + 1;
    const disabledUntil = failures >= FAILURE_THRESHOLD ? new Date(Date.now() + DISABLE_COOLDOWN_MS) : provider.disabled_until;
    try {
      await aiProviderRepository.recordFailure(provider.id, failures, disabledUntil);
    } catch {
      // Failure bookkeeping must not mask the original error.
    }
    await logUsage({
      providerId: provider.id,
      apiKeyId: key.id,
      doctorId: ctx.doctorId,
      model,
      promptTokens: 0,
      completionTokens: 0,
      estimatedCost: 0,
      responseTimeMs: Date.now() - started,
      success: false,
      errorMessage: message,
      requestType: opts.requestType ?? ctx.requestType,
    });
    throw err;
  }
}
