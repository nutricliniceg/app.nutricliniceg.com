import { settingsRepository } from '@/lib/db/repositories/settings.repo';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export interface TurnstileConfig {
  enabled: boolean;
  siteKey: string | null;
  secretKey: string | null;
}

// Settings-first (`security.turnstile`), env fallback — unset settings
// preserve historic env-only behavior exactly.
export async function resolveTurnstileConfig(): Promise<TurnstileConfig> {
  const envSecret = process.env.TURNSTILE_SECRET_KEY || null;
  try {
    const saved = await settingsRepository.get<{ enabled?: boolean; site_key?: string; secret_key?: string }>('security.turnstile');
    if (saved && typeof saved === 'object') {
      const secret = saved.secret_key?.trim() || envSecret;
      const enabled = typeof saved.enabled === 'boolean' ? saved.enabled : secret !== null;
      return { enabled, siteKey: saved.site_key?.trim() || null, secretKey: secret };
    }
  } catch {
    // Settings unavailable — fall through to env.
  }
  return { enabled: envSecret !== null, siteKey: null, secretKey: envSecret };
}

export async function isTurnstileRequired(): Promise<boolean> {
  return (await resolveTurnstileConfig()).enabled;
}

export async function verifyTurnstile(token: string): Promise<boolean> {
  const { secretKey } = await resolveTurnstileConfig();
  if (!secretKey) return false;
  try {
    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: secretKey, response: token }),
      signal: AbortSignal.timeout(8000),
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

// Historic sync entry point (env-only) — kept for compatibility; new code
// prefers the settings-aware isTurnstileRequired() above.
export function isTurnstileEnforced(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}
