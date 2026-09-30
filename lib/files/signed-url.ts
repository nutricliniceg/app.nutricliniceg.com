import { createHmac, timingSafeEqual } from 'crypto';

export const SIGNED_URL_TTL_MS = 15 * 60 * 1000;

function secret(): string {
  const s = process.env.FILE_URL_SECRET;
  if (!s || s.length < 16) throw new Error('FILE_URL_SECRET is not configured');
  return s;
}

function b64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function unb64url(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

export function mintFileToken(fileId: string, ownerId: string, ttlMs = SIGNED_URL_TTL_MS): string {
  const exp = Date.now() + ttlMs;
  const payload = b64url(JSON.stringify({ f: fileId, o: ownerId, e: exp }));
  const sig = createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export interface VerifiedFileToken {
  fileId: string;
  ownerId: string;
}

export function verifyFileToken(token: string, now = Date.now()): VerifiedFileToken | null {
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
    const data = JSON.parse(unb64url(payload)) as { f?: unknown; o?: unknown; e?: unknown };
    if (typeof data.f !== 'string' || typeof data.o !== 'string' || typeof data.e !== 'number') return null;
    if (data.e <= now) return null;
    return { fileId: data.f, ownerId: data.o };
  } catch {
    return null;
  }
}
