import { executeQuery } from '@/lib/db/pool';
import { randomUUID } from 'crypto';

export interface SystemErrorInsert {
  level: string;
  source: string;
  message: string;
  path: string | null;
  userId: string | null;
}

export const errorsRepository = {
  insert: async (data: SystemErrorInsert): Promise<void> => {
    await executeQuery(
      `INSERT INTO SystemErrorLog (id, level, source, message, path, user_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [randomUUID(), data.level, data.source, data.message, data.path, data.userId]
    );
  },

  list: async (filters: { level?: string; source?: string; resolved?: boolean; page?: number; limit?: number }): Promise<{ rows: Record<string, unknown>[]; total: number }> => {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 100);
    const offset = (page - 1) * limit;
    const where: string[] = [];
    const params: Array<string | number> = [];
    if (filters.level) {
      where.push('level = ?');
      params.push(filters.level);
    }
    if (filters.source) {
      where.push('source LIKE ?');
      params.push(`%${filters.source}%`);
    }
    if (filters.resolved === true) where.push('resolved_at IS NOT NULL');
    if (filters.resolved === false) where.push('resolved_at IS NULL');
    const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await executeQuery<Record<string, unknown>[]>(
      // eslint-disable-next-line no-restricted-syntax -- WHERE fragments are fixed; values use ? placeholders (D-01)
      `SELECT * FROM SystemErrorLog ${clause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const totalRows = await executeQuery<{ count: number }[]>(
      // eslint-disable-next-line no-restricted-syntax -- WHERE fragments are fixed; values use ? placeholders (D-01)
      `SELECT COUNT(*) as count FROM SystemErrorLog ${clause}`,
      params
    );
    return { rows, total: totalRows[0].count };
  },

  resolve: async (id: string, note: string | null): Promise<void> => {
    await executeQuery('UPDATE SystemErrorLog SET resolved_at = ?, resolution_note = ? WHERE id = ?', [new Date(), note, id]);
  },
};
