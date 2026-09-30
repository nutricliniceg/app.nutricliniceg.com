import { executeQuery } from '@/lib/db/pool';

// All infrastructure-maintenance SQL lives here so services/routes stay
// SQL-free: health ping, rate-limit window counting, cron cleanup deletes,
// newsletter housekeeping, activation-reminder lookup.
export const maintenanceRepository = {
  async ping(): Promise<void> {
    await executeQuery<Array<{ n: number }>>('SELECT 1 as n');
  },

  async rateLimitCount(key: string, windowStart: Date): Promise<number> {
    const rows = await executeQuery<Array<{ count: number }>>(
      'SELECT COUNT(*) as count FROM rate_limits WHERE `key` = ? AND window_start = ?',
      [key, windowStart]
    );
    return Number(rows[0]?.count ?? 0);
  },

  async rateLimitIncrement(key: string, windowStart: Date): Promise<void> {
    await executeQuery(
      'INSERT INTO rate_limits (`key`, window_start, count) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE count = count + 1',
      [key, windowStart]
    );
  },

  async cleanupExpiredCodes(): Promise<number> {
    const r = await executeQuery<{ affectedRows: number }>(
      'DELETE FROM VerificationCode WHERE expires_at < NOW() OR used_at IS NOT NULL AND used_at < DATE_SUB(NOW(), INTERVAL 7 DAY)',
      []
    );
    return Number((r as unknown as { affectedRows?: number }).affectedRows ?? 0);
  },

  async cleanupExpiredResets(): Promise<number> {
    try {
      const r = await executeQuery<{ affectedRows: number }>(
        'DELETE FROM PasswordReset WHERE expires_at < NOW() OR used_at IS NOT NULL',
        []
      );
      return Number((r as unknown as { affectedRows?: number }).affectedRows ?? 0);
    } catch {
      return 0;
    }
  },

  async cleanupResolvedLogs(): Promise<number> {
    try {
      const r = await executeQuery<{ affectedRows: number }>(
        'DELETE FROM SystemErrorLog WHERE created_at < DATE_SUB(NOW(), INTERVAL 90 DAY) AND resolved_at IS NOT NULL',
        []
      );
      return Number((r as unknown as { affectedRows?: number }).affectedRows ?? 0);
    } catch {
      return 0;
    }
  },

  async scrubOldAiErrors(): Promise<number> {
    try {
      const r = await executeQuery<{ affectedRows: number }>(
        'UPDATE AiUsageLog SET error_message = NULL WHERE created_at < DATE_SUB(NOW(), INTERVAL 6 MONTH) AND error_message IS NOT NULL',
        []
      );
      return Number((r as unknown as { affectedRows?: number }).affectedRows ?? 0);
    } catch {
      return 0;
    }
  },

  async deleteExpiredPendingSubscribers(): Promise<number> {
    const r = await executeQuery<{ affectedRows: number }>(
      "DELETE FROM NewsletterSubscriber WHERE status = 'pending' AND created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)",
      []
    );
    return Number((r as unknown as { affectedRows?: number }).affectedRows ?? 0);
  },

  async countBouncedSubscribers(): Promise<number> {
    const rows = await executeQuery<Array<{ count: number }>>(
      "SELECT COUNT(*) as count FROM NewsletterSubscriber WHERE status = 'bounced'",
      []
    );
    return Number(rows[0]?.count ?? 0);
  },

  async listStalePendingUsers(): Promise<Array<{ id: string; email: string; created_at: Date }>> {
    return executeQuery<Array<{ id: string; email: string; created_at: Date }>>(
      'SELECT id, email, created_at FROM User WHERE is_active = FALSE AND created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR) ORDER BY created_at ASC LIMIT 100',
      []
    );
  },
};
