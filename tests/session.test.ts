import { describe, it, expect } from 'vitest';
import {
  getTokenFromRequest,
  verifyTokenString,
  createSessionCookie,
  destroySession,
} from '@/lib/security/session';

function reqWithCookie(header: string | null): Request {
  const headers = new Headers();
  if (header !== null) headers.set('cookie', header);
  return new Request('http://localhost/api/me', { headers });
}

describe('session token helpers', () => {
  it('extracts the session cookie', () => {
    expect(getTokenFromRequest(reqWithCookie('nc_session=abc123'))).toBe('abc123');
    expect(getTokenFromRequest(reqWithCookie('other=1; nc_session=tok; x=2'))).toBe('tok');
    expect(getTokenFromRequest(reqWithCookie(null))).toBeNull();
    expect(getTokenFromRequest(reqWithCookie('other=1'))).toBeNull();
  });

  it('round-trips a signed token', async () => {
    const token = await createSessionCookie({ sub: 'u1', role: 'doctor', email: 'd@x.com' });
    const payload = await verifyTokenString(token);
    expect(payload?.sub).toBe('u1');
    expect(payload?.role).toBe('doctor');
    expect(typeof payload?.jti).toBe('string');
  });

  it('rejects tampered tokens', async () => {
    expect(await verifyTokenString('not.a.token')).toBeNull();
    const token = await createSessionCookie({ sub: 'u1', role: 'doctor', email: 'd@x.com' });
    expect(await verifyTokenString(token + 'tampered')).toBeNull();
  });

  it('destroys the session without throwing', async () => {
    await expect(destroySession()).resolves.toBeUndefined();
  });
});
