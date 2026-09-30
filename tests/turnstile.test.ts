import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { verifyTurnstile, isTurnstileEnforced } from '@/lib/auth/turnstile';

describe('turnstile helper', () => {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  beforeEach(() => {
    process.env.TURNSTILE_SECRET_KEY = 'test-secret';
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (secret === undefined) delete process.env.TURNSTILE_SECRET_KEY;
    else process.env.TURNSTILE_SECRET_KEY = secret;
  });

  it('returns true on provider success', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ json: async () => ({ success: true }) });
    await expect(verifyTurnstile('tok')).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('turnstile'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('returns false on provider rejection', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ json: async () => ({ success: false }) });
    await expect(verifyTurnstile('tok')).resolves.toBe(false);
  });

  it('returns false on network failure', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('down'));
    await expect(verifyTurnstile('tok')).resolves.toBe(false);
  });

  it('reports enforcement from env', () => {
    process.env.TURNSTILE_SECRET_KEY = 'x';
    expect(isTurnstileEnforced()).toBe(true);
    delete process.env.TURNSTILE_SECRET_KEY;
    expect(isTurnstileEnforced()).toBe(false);
  });
});
