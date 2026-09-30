import { describe, it, expect, vi, beforeEach } from 'vitest';
import { signToken, verifyToken, verifyTokenWithPayload } from '@/lib/security/jwt';
import { verifyTokenString, createSessionCookie } from '@/lib/security/session';

vi.mock('@/lib/env', () => ({
  env: {
    JWT_SECRET: 'not real just words for testing only change me',
  },
}));

vi.mock('next/headers', () => ({
  cookies: () => ({
    set: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  }),
}));

describe('JWT Security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should sign and verify a token', async () => {
    const token = await signToken({ sub: 'user-123', role: 'doctor', email: 'test@example.com' });
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3);

    const payload = await verifyToken(token);
    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe('user-123');
    expect(payload?.role).toBe('doctor');
  });

  it('should return null for invalid token', async () => {
    const payload = await verifyToken('invalid.token.string');
    expect(payload).toBeNull();
  });

  it('should return null for expired token', async () => {
    const { SignJWT } = await import('jose');
    const secret = new TextEncoder().encode('test-secret-key-at-least-32-chars-long-for-testing');
    const expiredToken = await new SignJWT({ sub: 'user-123', role: 'doctor', email: 'test@example.com' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('-1s')
      .sign(secret);

    const payload = await verifyToken(expiredToken);
    expect(payload).toBeNull();
  });

  it('should verify token with payload structure', async () => {
    const token = await signToken({ sub: 'user-123', role: 'admin', email: 'admin@example.com' });
    const result = await verifyTokenWithPayload(token);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.payload.sub).toBe('user-123');
      expect(result.payload.role).toBe('admin');
    }
  });
});

describe('Session Cookie', () => {
  it('should create session cookie', async () => {
    const token = await createSessionCookie({ sub: 'user-123', role: 'doctor', email: 'test@example.com' });
    expect(typeof token).toBe('string');
  });
});