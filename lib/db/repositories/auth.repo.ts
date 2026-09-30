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

  createCode: async (userId: string, code: string, expiresAt: Date): Promise<void> => {
    await executeQuery(
      'INSERT INTO VerificationCode (user_id, code, expires_at) VALUES (?, ?, ?)',
      [userId, code, expiresAt]
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

  logEvent: async (userId: string | null, eventType: string, details: Record<string, unknown>): Promise<void> => {
    await executeQuery(
      'INSERT INTO AuditLog (actor_id, actor_role, action, entity_type, entity_id, ip_hash, user_agent, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [userId, 'system', eventType, 'System', null, null, null, JSON.stringify(details)]
    );
  },
};
