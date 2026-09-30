import { settingsRepository } from '@/lib/db/repositories/settings.repo';
import { serviceFail } from '@/lib/errors/fail';

// SEC-20: admin-editable password policy (`security.password_policy`).
// Defaults mirror the historic hardcoded floor (min 8, no complexity, no
// expiry) so behavior is unchanged until an admin tunes it.
export interface PasswordPolicy {
  minLength: number;
  requireUpper: boolean;
  requireDigit: boolean;
  requireSymbol: boolean;
  expiryDays: number;
}

export const DEFAULT_POLICY: PasswordPolicy = {
  minLength: 8,
  requireUpper: false,
  requireDigit: false,
  requireSymbol: false,
  expiryDays: 0,
};

export async function getPasswordPolicy(): Promise<PasswordPolicy> {
  try {
    const saved = await settingsRepository.get<Partial<PasswordPolicy>>('security.password_policy');
    if (saved && typeof saved === 'object') {
      return {
        minLength: Math.min(128, Math.max(8, Number(saved.minLength) || DEFAULT_POLICY.minLength)),
        requireUpper: saved.requireUpper === true,
        requireDigit: saved.requireDigit === true,
        requireSymbol: saved.requireSymbol === true,
        expiryDays: Math.min(3650, Math.max(0, Number(saved.expiryDays) || 0)),
      };
    }
  } catch {
    // Settings unavailable — historic defaults apply.
  }
  return { ...DEFAULT_POLICY };
}

export async function assertPasswordPolicy(password: string): Promise<void> {
  const policy = await getPasswordPolicy();
  if (password.length < policy.minLength) {
    throw serviceFail('POLICY_VIOLATION', `Password must be at least ${policy.minLength} characters`);
  }
  if (policy.requireUpper && !/[A-Z\u00C0-\u024F]/.test(password)) {
    throw serviceFail('POLICY_VIOLATION', 'Password must contain an uppercase letter');
  }
  if (policy.requireDigit && !/\d/.test(password)) {
    throw serviceFail('POLICY_VIOLATION', 'Password must contain a digit');
  }
  if (policy.requireSymbol && !/[^A-Za-z0-9\u00C0-\u024F]/.test(password)) {
    throw serviceFail('POLICY_VIOLATION', 'Password must contain a symbol');
  }
}

// Sync expiry predicate over an already-resolved policy (login hot path
// resolves the policy once via getPasswordPolicy).
export function isExpiredByPolicy(changedAt: Date | string | null, expiryDays: number, now = Date.now()): boolean {
  if (!expiryDays || expiryDays <= 0 || !changedAt) return false;
  return now - new Date(changedAt).getTime() > expiryDays * 86400000;
}
