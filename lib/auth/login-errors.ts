// Maps the `error.code` values emitted by app/api/auth/login/route.ts
// (lib/api/response.ts `fail()`) to i18n keys in the `login.errors`
// namespace. Server messages are English-only and must never be rendered
// verbatim to an Arabic user; unknown codes fall back to a neutral message
// so a new server-side code can never leak raw text into the UI.

const LOGIN_ERROR_KEYS: Record<string, string> = {
  INVALID_CREDENTIALS: 'invalidCredentials',
  ACCOUNT_INACTIVE: 'accountInactive',
  EMAIL_NOT_VERIFIED: 'emailNotVerified',
  PASSWORD_EXPIRED: 'passwordExpired',
  RATE_LIMITED: 'rateLimited',
  TURNSTILE_FAILED: 'securityCheckFailed',
  VALIDATION_ERROR: 'invalidInput',
  INVALID_JSON: 'invalidInput',
  INTERNAL_ERROR: 'generic',
};

export const DEFAULT_LOGIN_ERROR_KEY = 'generic';

export function loginErrorKey(code: string | null | undefined): string {
  if (!code) return DEFAULT_LOGIN_ERROR_KEY;
  return LOGIN_ERROR_KEYS[code] ?? DEFAULT_LOGIN_ERROR_KEY;
}