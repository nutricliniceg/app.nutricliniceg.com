import { createHmac, timingSafeEqual } from 'crypto';

// Short-lived share links for print pages (doctor-generated, no login
// needed to open). HMAC-signed; wrong/expired/revoked keys share ONE
// generic error (anti-enumeration). Reuses FILE_URL_SECRET (fail-fast at
// boot via lib/env) with a distinct payload prefix — no new env var.

export const PRINT_LINK_TTL_MS = 24 * 60 * 60 * 1000;

const PREFIX = 'print1';

function secret(): string {
  const s = process.env.FILE_URL_SECRET;
  if (!s || s.length < 16) throw new Error('FILE_URL_SECRET is not configured');
  return s;
}

export function mintPrintKey(planType: 'nutrition' | 'exercise', planId: string, ttlMs = PRINT_LINK_TTL_MS): string {
  const exp = Date.now() + ttlMs;
  const payload = Buffer.from(JSON.stringify({ p: PREFIX, t: planType, id: planId, e: exp }), 'utf8').toString('base64url');
  const sig = createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export interface VerifiedPrintKey {
  planType: 'nutrition' | 'exercise';
  planId: string;
}

export function verifyPrintKey(key: string, now = Date.now()): VerifiedPrintKey | null {
  const dot = key.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = key.slice(0, dot);
  const sig = key.slice(dot + 1);
  let expected: string;
  try {
    expected = createHmac('sha256', secret()).update(payload).digest('base64url');
  } catch {
    return null;
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { p?: unknown; t?: unknown; id?: unknown; e?: unknown };
    if (data.p !== PREFIX || (data.t !== 'nutrition' && data.t !== 'exercise')) return null;
    if (typeof data.id !== 'string' || typeof data.e !== 'number') return null;
    if (data.e <= now) return null;
    return { planType: data.t, planId: data.id };
  } catch {
    return null;
  }
}
