import { randomUUID } from 'crypto';
import { executeQuery } from '@/lib/db/pool';

export const authRepository = {
  revokeToken: async (jti: string, userId: string, expiresAt: Date): Promise<void> => {
    await executeQuery(
      'INSERT INTO RevokedToken (jti, user_id, expires_at) VALUES (?, ?, ?)',
      [jti, userId, expiresAt]
    );
  },

  isTokenRevoked: async (jti: string): Promise<boolean> => {
    const rows = await executeQuery<{ count: number }[]>('SELECT COUNT(*) as count FROM RevokedToken WHERE jti = ?', [jti]);
    return rows[0].count > 0;
  },

  // VerificationCode.id is `varchar(36) PRIMARY KEY` NOT NULL with NO default.
  // This insert omitted the column, so MySQL bound the empty string: the first
  // call "succeeded" and every later one died with ER_DUP_ENTRY "Duplicate
  // entry '' for key 'PRIMARY'", silently breaking email verification and
  // password-reset codes. Same class as the AuditLog defect fixed in logEvent
  // below; id is generated here and bound as the first parameter (P33
  // convention — never an inline UUID() in the SQL text).
  createCode: async (userId: string, code: string, expiresAt: Date): Promise<void> => {
    await executeQuery(
      'INSERT INTO VerificationCode (id, user_id, code, expires_at) VALUES (?, ?, ?, ?)',
      [randomUUID(), userId, code, expiresAt]
    );
  },

  consumeCode: async (userId: string, code: string): Promise<boolean> => {
    const rows = await executeQuery<{ id: number }[]>(
      'SELECT id FROM VerificationCode WHERE user_id = ? AND code = ? AND expires_at > NOW() AND used_at IS NULL',
      [userId, code]
    );
    if (rows.length === 0) return false;
    await executeQuery('UPDATE VerificationCode SET used_at = NOW() WHERE id = ?', [rows[0].id]);
    return true;
  },

  // AuditLog.id is `varchar(36) PRIMARY KEY` NOT NULL with NO default. This
  // insert used to omit the column entirely, so MySQL bound the empty string:
  // the FIRST call "succeeded" (one row with id='') and EVERY subsequent call
  // died with ER_DUP_ENTRY "Duplicate entry '' for key 'PRIMARY'". Because
  // logEvent backs doctor registration (USER_REGISTERED) and login-failure
  // logging (LOGIN_FAILED), audit was silently broken app-wide after one call.
  // The id is now generated here as a bound parameter, matching the P33
  // convention used by backup.repo.ts (never an inline UUID() in the SQL text).
  logEvent: async (userId: string | null, eventType: string, details: Record<string, unknown>): Promise<void> => {
    await executeQuery(
      'INSERT INTO AuditLog (id, actor_id, actor_role, action, entity_type, entity_id, ip_hash, user_agent, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())',
      [randomUUID(), userId, 'system', eventType, 'System', null, null, null, JSON.stringify(details)]
    );
  },
};
