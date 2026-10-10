import { describe, it, expect, vi, afterEach } from 'vitest';
import { readApi, ApiRequestError } from '@/lib/api/fetch-json';
import { loginErrorKey, DEFAULT_LOGIN_ERROR_KEY } from '@/lib/auth/login-errors';

function jsonResponse(body: unknown): Response {
  return { json: async () => body } as Response;
}

async function captureError(promise: Promise<unknown>): Promise<ApiRequestError> {
  try {
    await promise;
  } catch (e) {
    return e as ApiRequestError;
  }
  throw new Error('expected readApi to reject');
}

describe('login page: API envelope + error-code mapping', () => {
  afterEach(() => vi.restoreAllMocks());

  it('unwraps the login success envelope', async () => {
    const res = jsonResponse({
      success: true,
      data: { user: { id: 'u1' }, redirectTo: '/dashboard' },
      meta: { message: 'Login successful' },
    });
    await expect(readApi<{ redirectTo: string }>(res)).resolves.toMatchObject({ redirectTo: '/dashboard' });
  });

  it('throws ApiRequestError carrying the server error code', async () => {
    const res = jsonResponse({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });
    await expect(readApi(res)).rejects.toBeInstanceOf(ApiRequestError);
    const err = await captureError(readApi(res));
    expect(err.code).toBe('INVALID_CREDENTIALS');
    // Backward compatibility: existing consumers read `message`.
    expect(err.message).toBe('Invalid email or password');
  });

  it('falls back to UNKNOWN when the envelope has no code', async () => {
    const err = await captureError(readApi(jsonResponse({ success: false })));
    expect(err.code).toBe('UNKNOWN');
  });

  it('maps every login route error code to an i18n key', () => {
    expect(loginErrorKey('INVALID_CREDENTIALS')).toBe('invalidCredentials');
    expect(loginErrorKey('ACCOUNT_INACTIVE')).toBe('accountInactive');
    expect(loginErrorKey('EMAIL_NOT_VERIFIED')).toBe('emailNotVerified');
    expect(loginErrorKey('PASSWORD_EXPIRED')).toBe('passwordExpired');
    expect(loginErrorKey('RATE_LIMITED')).toBe('rateLimited');
    expect(loginErrorKey('TURNSTILE_FAILED')).toBe('securityCheckFailed');
    expect(loginErrorKey('VALIDATION_ERROR')).toBe('invalidInput');
    expect(loginErrorKey('INVALID_JSON')).toBe('invalidInput');
    expect(loginErrorKey('INTERNAL_ERROR')).toBe('generic');
  });

  it('never leaks an unknown code or raw server text', () => {
    expect(loginErrorKey('SOMETHING_NEW')).toBe(DEFAULT_LOGIN_ERROR_KEY);
    expect(loginErrorKey(null)).toBe(DEFAULT_LOGIN_ERROR_KEY);
    expect(loginErrorKey(undefined)).toBe(DEFAULT_LOGIN_ERROR_KEY);
  });

  it('every mapped key exists in both message catalogs', async () => {
    const ar = (await import('@/messages/ar.json')).default as { login: { errors: Record<string, string> } };
    const en = (await import('@/messages/en.json')).default as { login: { errors: Record<string, string> } };
    for (const code of [
      'INVALID_CREDENTIALS',
      'ACCOUNT_INACTIVE',
      'EMAIL_NOT_VERIFIED',
      'PASSWORD_EXPIRED',
      'RATE_LIMITED',
      'TURNSTILE_FAILED',
      'VALIDATION_ERROR',
      'INTERNAL_ERROR',
    ]) {
      const key = loginErrorKey(code);
      expect(ar.login.errors[key], `ar:${key}`).toBeTruthy();
      expect(en.login.errors[key], `en:${key}`).toBeTruthy();
    }
  });
});