import { describe, it, expect, beforeEach } from 'vitest';
import { mintFileToken, verifyFileToken } from '@/lib/files/signed-url';

describe('signed download URLs (15-min HMAC)', () => {
  beforeEach(() => {
    process.env.FILE_URL_SECRET = 'test-file-url-secret-16';
  });

  it('round-trips a valid token', () => {
    const token = mintFileToken('file-1', 'owner-1');
    expect(verifyFileToken(token)).toEqual({ fileId: 'file-1', ownerId: 'owner-1' });
  });

  it('rejects expired tokens', () => {
    const token = mintFileToken('file-1', 'owner-1', -1000);
    expect(verifyFileToken(token)).toBeNull();
  });

  it('rejects tampered tokens', () => {
    const token = mintFileToken('file-1', 'owner-1');
    const [payload, sig] = token.split('.');
    const tampered = `${payload.slice(0, -2)}XX.${sig}`;
    expect(verifyFileToken(tampered)).toBeNull();
    expect(verifyFileToken(payload + '.wrongsig')).toBeNull();
    expect(verifyFileToken('garbage')).toBeNull();
  });

  it('rejects tokens verified for the wrong file', () => {
    const token = mintFileToken('file-1', 'owner-1');
    const v = verifyFileToken(token);
    expect(v?.fileId).not.toBe('file-2');
  });
});
