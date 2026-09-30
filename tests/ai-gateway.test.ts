import { describe, it, expect, vi, beforeEach } from 'vitest';
import { aiGatewayService } from '@/lib/admin/ai-gateway.service';
import { aiProviderRepository, aiKeyRepository, aiUsageRepository } from '@/lib/db/repositories/ai.repo';
import { settingsRepository } from '@/lib/db/repositories/settings.repo';

vi.mock('@/lib/db/repositories/ai.repo', () => ({
  aiProviderRepository: {
    listChain: vi.fn().mockResolvedValue([]), listAll: vi.fn().mockResolvedValue([]),
    findById: vi.fn(), update: vi.fn().mockResolvedValue(undefined),
    recordFailure: vi.fn(), recordSuccess: vi.fn(), probeResult: vi.fn(),
  },
  aiKeyRepository: {
    listActiveByProvider: vi.fn().mockResolvedValue([]), listMaskedByProvider: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockResolvedValue(undefined), updateMeta: vi.fn().mockResolvedValue(undefined),
    rotate: vi.fn().mockResolvedValue(undefined), remove: vi.fn().mockResolvedValue(undefined),
    touchUsed: vi.fn(),
  },
  aiUsageRepository: {
    insert: vi.fn(), monthlyForDoctor: vi.fn(), planCallCap: vi.fn(),
    explore: vi.fn(), monthTotals: vi.fn(), byDoctor: vi.fn(), byProvider: vi.fn(),
    dailyTrend: vi.fn(), keyStats: vi.fn().mockResolvedValue({ calls: 0, cost: 0, last_used: null }),
  },
  aiRetryRepository: { enqueue: vi.fn(), claimDue: vi.fn(), markProcessing: vi.fn(), markDone: vi.fn(), markRequeued: vi.fn(), markDeadLetter: vi.fn() },
}));

vi.mock('@/lib/db/repositories/settings.repo', () => ({
  settingsRepository: { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue(undefined), list: vi.fn().mockResolvedValue([]) },
}));

type Mock = ReturnType<typeof vi.fn>;

beforeEach(() => { vi.clearAllMocks(); });

describe('P23 reorder changes the live fallback chain', () => {
  it('persists priority order that listChain then serves', async () => {
    (aiProviderRepository.listAll as Mock).mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    await aiGatewayService.reorder(['b', 'a']);
    expect(aiProviderRepository.update as Mock).toHaveBeenCalledWith('b', { priorityOrder: 1 });
    expect(aiProviderRepository.update as Mock).toHaveBeenCalledWith('a', { priorityOrder: 2 });
    // The P12 chain consumes listChain order verbatim (mock adapters):
    (aiProviderRepository.listChain as Mock).mockResolvedValue([
      { id: 'b', type: 'gemini', priority_order: 1, is_enabled: true },
      { id: 'a', type: 'openai', priority_order: 2, is_enabled: true },
    ]);
    const chain = await aiProviderRepository.listChain();
    expect(chain.map((p) => p.id)).toEqual(['b', 'a']);
  });

  it('rejects partial orders', async () => {
    (aiProviderRepository.listAll as Mock).mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    await expect(aiGatewayService.reorder(['a'])).rejects.toMatchObject({ code: 'INVALID_ORDER' });
  });
});

describe('P23 masked keys never leak', () => {
  it('listProviders exposes hints only', async () => {
    (aiProviderRepository.listAll as Mock).mockResolvedValue([
      { id: 'p1', name: 'OpenAI', type: 'openai', base_url: null, priority_order: 1, is_enabled: true },
    ]);
    (aiKeyRepository.listMaskedByProvider as Mock).mockResolvedValue([
      { id: 'k1', name: 'main', key_hint: 'sk-…1234', is_active: true, last_used_at: null, last_rotated_at: null },
    ]);
    const out = await aiGatewayService.listProviders();
    expect(JSON.stringify(out)).not.toContain('key_encrypted');
    expect(JSON.stringify(out)).toContain('sk-…1234');
  });

  it('addKey encrypts at rest and returns hint only', async () => {
    (aiProviderRepository.findById as Mock).mockResolvedValue({ id: 'p1', type: 'openai' });
    const out = await aiGatewayService.addKey('p1', 'sk-live-secret-value-1234', 'main');
    expect(out.key_hint).toContain('…1234');
    expect(JSON.stringify(out)).not.toContain('sk-live-secret-value-1234');
    const stored = (aiKeyRepository.insert as Mock).mock.calls[0][0] as { keyEncrypted: string };
    expect(stored.keyEncrypted).not.toContain('sk-live-secret-value-1234');
  });
});

describe('P23 sensitive-settings gate', () => {
  it('hides turnstile secret from non-super admins', async () => {
    (settingsRepository.get as Mock).mockImplementation(async (key: string) => {
      if (key === 'security.turnstile') return { enabled: true, site_key: 'site-1', secret_key: 'secret-abc-123' };
      return null;
    });
    const admin = await aiGatewayService.getSecurity(false);
    expect(admin.turnstile.secret_set).toBe(true);
    expect(admin.turnstile.secret_hint).toBeNull();
    const low = await aiGatewayService.getSecurity(true);
    expect(low.turnstile.secret_hint).toContain('••');
    expect(low.turnstile.secret_hint).not.toContain('secret-abc-123');
  });
});

describe('P23 cost aggregation math', () => {
  it('totals match seeded rows with success-rate math', async () => {
    (aiUsageRepository.monthTotals as Mock).mockResolvedValue({ calls: 10, tokens: 5000, cost: 0.5 });
    (aiUsageRepository.byDoctor as Mock).mockResolvedValue([
      { doctor_id: 'd1', doctor_name: 'D1', calls: 7, tokens: 3500, cost: 0.35 },
      { doctor_id: 'd2', doctor_name: 'D2', calls: 3, tokens: 1500, cost: 0.15 },
    ]);
    (aiUsageRepository.byProvider as Mock).mockResolvedValue([
      { provider_id: 'p1', provider_type: 'openai', calls: 10, success_rate: 90, cost: 0.5 },
    ]);
    (aiUsageRepository.dailyTrend as Mock).mockResolvedValue([{ day: '2026-09-01', calls: 10, cost: 0.5 }]);
    const out = await aiGatewayService.costDashboard('2026-09-01T00:00:00Z', '2026-09-30T23:59:59Z', 10);
    expect(out.totals).toMatchObject({ calls: 10, tokens: 5000, cost: 0.5 });
    expect(out.byDoctor.reduce((s, d) => s + d.cost, 0)).toBeCloseTo(0.5);
    expect(out.byProvider[0].success_rate).toBe(90);
    expect(aiGatewayService.toCsv(out.trend)).toContain('2026-09-01,10,0.5');
  });
});
