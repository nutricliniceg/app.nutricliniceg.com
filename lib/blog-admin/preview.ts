import { createHmac, timingSafeEqual } from 'crypto';

// Signed preview links: ?preview=<token> opens a draft/scheduled post
// without login (BLG-10). 7-day HMAC tokens; failures share one 404.
export const PREVIEW_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const PREFIX = 'preview1';

function secret(): string {
  const s = process.env.FILE_URL_SECRET;
  if (!s || s.length < 16) throw new Error('FILE_URL_SECRET is not configured');
  return s;
}

export function mintPreviewToken(postId: string, ttlMs = PREVIEW_TTL_MS): string {
  const exp = Date.now() + ttlMs;
  const payload = Buffer.from(JSON.stringify({ p: PREFIX, id: postId, e: exp }), 'utf8').toString('base64url');
  const sig = createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyPreviewToken(token: string, now = Date.now()): string | null {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
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
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { p?: unknown; id?: unknown; e?: unknown };
    if (data.p !== PREFIX || typeof data.id !== 'string' || typeof data.e !== 'number') return null;
    if (data.e <= now) return null;
    return data.id;
  } catch {
    return null;
  }
}
