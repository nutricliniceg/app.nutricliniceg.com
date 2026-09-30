import { randomUUID } from 'crypto';
import { aiProviderRepository, aiKeyRepository, aiUsageRepository, type AiProviderType, type AiDataRetention } from '@/lib/db/repositories/ai.repo';
import { settingsRepository } from '@/lib/db/repositories/settings.repo';
import { encryptSecret, makeKeyHint } from '@/lib/ai/vault';
import { probeProvider } from '@/lib/ai/health';
import { DEFAULT_POLICY, type PasswordPolicy } from '@/lib/auth/password-policy';
import { fail } from '@/lib/plans';

const PROVIDER_TYPES: AiProviderType[] = ['openai', 'gemini', 'anthropic', 'custom'];

function maskSecret(secret: string | null): string | null {
  if (!secret) return null;
  if (secret.length <= 8) return '••••••••';
  return `${secret.slice(0, 3)}••••${secret.slice(-2)}`;
}

export const aiGatewayService = {
  // ADM-08: provider cards with masked keys + per-key usage.
  async listProviders() {
    const providers = await aiProviderRepository.listAll();
    const out = [];
    for (const p of providers) {
      const keys = await aiKeyRepository.listMaskedByProvider(p.id);
      const withStats = [];
      for (const k of keys) {
        withStats.push({ ...k, stats: await aiUsageRepository.keyStats(k.id) });
      }
      out.push({ ...p, keys: withStats });
    }
    return out;
  },

  async updateProvider(id: string, patch: { isEnabled?: boolean; priorityOrder?: number; baseUrl?: string | null; name?: string; dataRetention?: AiDataRetention }) {
    const row = await aiProviderRepository.findById(id);
    if (!row) throw fail('NOT_FOUND', 'Provider not found');
    if (patch.baseUrl !== undefined && row.type !== 'custom' && patch.baseUrl) {
      throw fail('INVALID_PROVIDER', 'Only the custom provider accepts a base URL');
    }
    await aiProviderRepository.update(id, {
      isEnabled: patch.isEnabled, priorityOrder: patch.priorityOrder,
      baseUrl: patch.baseUrl, name: patch.name, dataRetention: patch.dataRetention,
    });
    return { id };
  },

  // Drag-to-reorder persistence: ids in new fallback order.
  async reorder(ids: string[]) {
    const providers = await aiProviderRepository.listAll();
    const known = new Set(providers.map((p) => p.id));
    if (ids.length !== providers.length || !ids.every((id) => known.has(id))) {
      throw fail('INVALID_ORDER', 'Order must contain every provider exactly once');
    }
    let order = 1;
    for (const id of ids) {
      await aiProviderRepository.update(id, { priorityOrder: order });
      order += 1;
    }
    return { ids };
  },

  async addKey(providerId: string, plaintext: string, name?: string | null) {
    const provider = await aiProviderRepository.findById(providerId);
    if (!provider) throw fail('NOT_FOUND', 'Provider not found');
    const key = plaintext.trim();
    if (key.length < 8) throw fail('INVALID_KEY', 'Key looks too short to be valid');
    const id = randomUUID();
    await aiKeyRepository.insert({ id, providerId, keyEncrypted: encryptSecret(key), keyHint: makeKeyHint(key), name });
    return { id, key_hint: makeKeyHint(key) };
  },

  async updateKeyMeta(id: string, patch: { name?: string | null; isActive?: boolean }) {
    await aiKeyRepository.updateMeta(id, patch);
    return { id };
  },

  async rotateKey(id: string, plaintext: string) {
    const key = plaintext.trim();
    if (key.length < 8) throw fail('INVALID_KEY', 'Key looks too short to be valid');
    await aiKeyRepository.rotate(id, encryptSecret(key), makeKeyHint(key));
    return { id, key_hint: makeKeyHint(key) };
  },

  async removeKey(id: string) {
    await aiKeyRepository.remove(id);
    return { id };
  },

  async probe(id: string) {
    return probeProvider(id);
  },

  // ADM-23 cost dashboard (USD stored; EGP converted via settings rate).
  async costDashboard(from: string, to: string, topN = 10) {
    const [totals, byDoctor, byProvider, trend] = await Promise.all([
      aiUsageRepository.monthTotals(from, to),
      aiUsageRepository.byDoctor(from, to, topN),
      aiUsageRepository.byProvider(from, to),
      aiUsageRepository.dailyTrend(from, to),
    ]);
    const rate = await settingsRepository.get<number>('billing.usd_egp_rate');
    const usdToEgp = typeof rate === 'number' && rate > 0 ? rate : null;
    return {
      from, to,
      totals: { ...totals, cost_egp: usdToEgp === null ? null : Math.round(totals.cost * usdToEgp * 100) / 100, usd_to_egp: usdToEgp },
      byDoctor, byProvider, trend,
    };
  },

  async usageExplorer(filters: { providerId?: string; doctorId?: string; from?: string; to?: string; success?: boolean; page?: number; limit?: number }) {
    return aiUsageRepository.explore(filters);
  },

  toCsv(rows: Array<Record<string, unknown>>): string {
    const header = ['day', 'calls', 'cost_usd'];
    const lines = [header.join(',')];
    for (const r of rows) lines.push([r.day, r.calls, r.cost].join(','));
    return lines.join('\n');
  },

  // ADM-17 security page.
  async getSecurity(isSuper: boolean) {
    const [turnstile, policy] = await Promise.all([
      settingsRepository.get<{ enabled?: boolean; site_key?: string; secret_key?: string }>('security.turnstile'),
      settingsRepository.get<Partial<PasswordPolicy>>('security.password_policy'),
    ]);
    const secret = turnstile?.secret_key?.trim() || null;
    return {
      turnstile: {
        enabled: turnstile?.enabled === true,
        site_key: turnstile?.site_key ?? null,
        secret_set: secret !== null,
        secret_hint: isSuper ? maskSecret(secret) : null,
      },
      password_policy: { ...DEFAULT_POLICY, ...(policy ?? {}) },
    };
  },

  async setTurnstile(input: { enabled?: boolean; siteKey?: string | null; secretKey?: string | null }) {
    const current = await settingsRepository.get<{ enabled?: boolean; site_key?: string; secret_key?: string }>('security.turnstile');
    await settingsRepository.set('security.turnstile', {
      enabled: input.enabled ?? current?.enabled ?? false,
      site_key: input.siteKey !== undefined ? input.siteKey : current?.site_key ?? null,
      // Secret is write-only: omitted means keep the stored one.
      secret_key: input.secretKey !== undefined && input.secretKey !== null && input.secretKey !== ''
        ? input.secretKey
        : current?.secret_key ?? null,
    }, null);
    return { updated: true };
  },

  async setPasswordPolicy(input: Partial<PasswordPolicy>) {
    const merged = { ...DEFAULT_POLICY, ...input };
    await settingsRepository.set('security.password_policy', merged, null);
    return merged;
  },

  providerTypes(): AiProviderType[] {
    return [...PROVIDER_TYPES];
  },
};
