import { executeQuery } from '@/lib/db/pool';

// SystemSettings key/value store (PRD §9 table 24). Values are JSON.
export const settingsRepository = {
  get: async <T = unknown>(key: string): Promise<T | null> => {
    const rows = await executeQuery<{ value: string }[]>(
      'SELECT `value` FROM SystemSettings WHERE `key` = ?',
      [key]
    );
    if (rows.length === 0) return null;
    const raw = rows[0].value;
    try {
      return (typeof raw === 'string' ? JSON.parse(raw) : raw) as T;
    } catch {
      return null;
    }
  },

  set: async (key: string, value: unknown, updatedBy: string | null = null): Promise<void> => {
    await executeQuery(
      'INSERT INTO SystemSettings (`key`, `value`, updated_by) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), updated_by = VALUES(updated_by)',
      [key, JSON.stringify(value), updatedBy]
    );
  },

  list: async (): Promise<Array<{ key: string; is_sensitive: boolean | number; updated_at: Date }>> => {
    return executeQuery<Array<{ key: string; is_sensitive: boolean | number; updated_at: Date }>>(
      'SELECT `key`, is_sensitive, updated_at FROM SystemSettings ORDER BY `key` ASC'
    );
  },
};
