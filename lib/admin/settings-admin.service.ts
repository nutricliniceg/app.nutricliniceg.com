import { settingsRepository } from '@/lib/db/repositories/settings.repo';
import { fail } from '@/lib/plans';

// ADM-11: system settings. Rows flagged is_sensitive in DB — plus a
// builtin pattern list for keys never yet flagged — are super_admin-only.
const SENSITIVE_PATTERNS = ['smtp', 'paymob', 'secret', 'encryption', 'jwt', 'password', 'api_key', 'apikey', 'token', 'private'];

function isSensitiveKey(key: string, flagged: boolean): boolean {
  if (flagged) return true;
  const lower = key.toLowerCase();
  return SENSITIVE_PATTERNS.some((p) => lower.includes(p));
}

export const settingsAdminService = {
  async list(isSuper: boolean) {
    const rows = await settingsRepository.list();
    return rows.map((r) => {
      const sensitive = isSensitiveKey(r.key, r.is_sensitive === true || r.is_sensitive === 1);
      return { key: r.key, is_sensitive: sensitive, updated_at: r.updated_at, hidden: sensitive && !isSuper };
    });
  },

  async get(isSuper: boolean, key: string) {
    const rows = await settingsRepository.list();
    const row = rows.find((r) => r.key === key);
    if (!row) throw fail('NOT_FOUND', 'Setting not found');
    if (isSensitiveKey(key, row.is_sensitive === true || row.is_sensitive === 1) && !isSuper) {
      throw fail('FORBIDDEN', 'Sensitive settings are managed by super admins');
    }
    return settingsRepository.get(key);
  },

  async set(isSuper: boolean, key: string, value: unknown, updatedBy: string) {
    const rows = await settingsRepository.list();
    const row = rows.find((r) => r.key === key);
    if (isSensitiveKey(key, row ? row.is_sensitive === true || row.is_sensitive === 1 : false) && !isSuper) {
      throw fail('FORBIDDEN', 'Sensitive settings are managed by super admins');
    }
    await settingsRepository.set(key, value, updatedBy);
    return { key };
  },

  senderAliases(): Array<'no-reply' | 'info' | 'admin'> {
    return ['no-reply', 'info', 'admin'];
  },
};
