import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { executeQuery } from '@/lib/db/pool';

vi.mock('@/lib/db/pool');

const cfg = { windowMs: 60 * 1000, maxRequests: 2, keyPrefix: 'qg-test' };

describe('rate-limit (DB path, NODE_ENV=test)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('allows requests under the quota', async () => {
    (executeQuery as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ count: 0 }]).mockResolvedValueOnce([]);
    const r = await checkRateLimit('ip-1', cfg);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(1);
  });

  it('blocks when quota is exhausted', async () => {
    (executeQuery as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ count: 2 }]);
    const r = await checkRateLimit('ip-1', cfg);
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
  });

  it('falls back to memory when the DB throws', async () => {
    (executeQuery as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('db down'));
    const a = await checkRateLimit('fallback-ip', cfg);
    const b = await checkRateLimit('fallback-ip', cfg);
    const c = await checkRateLimit('fallback-ip', cfg);
    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);
    expect(c.allowed).toBe(false);
  });
});
