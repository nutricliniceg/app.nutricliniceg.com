import { executeQuery } from '@/lib/db/pool';

export interface AuditInsert {
  actorId: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  ipHash?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}

export const auditRepository = {
  insert: async (entry: AuditInsert): Promise<void> => {    await executeQuery(
      `INSERT INTO AuditLog (id, actor_id, actor_role, action, entity_type, entity_id, ip_hash, user_agent, metadata, created_at)
       VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        entry.actorId,
        entry.actorRole,
        entry.action,
        entry.entityType,
        entry.entityId ?? null,
        entry.ipHash ?? null,
        entry.userAgent ?? null,
        JSON.stringify(entry.metadata ?? {}),
      ]
    );
  },

  // ADM-22 read-only viewer (super_admin-only at the route layer). There
  // are intentionally no update/delete methods (§6.7: append-only).
  list: async (filters: { actor?: string; action?: string; entity?: string; from?: string; to?: string; page?: number; limit?: number }): Promise<{ rows: Record<string, unknown>[]; total: number }> => {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 100);
    const offset = (page - 1) * limit;
    const where: string[] = [];
    const params: Array<string | number> = [];
    if (filters.actor) {
      where.push('actor_id = ?');
      params.push(filters.actor);
    }
    if (filters.action) {
      where.push('action LIKE ?');
      params.push(`%${filters.action}%`);
    }
    if (filters.entity) {
      where.push('entity_type LIKE ?');
      params.push(`%${filters.entity}%`);
    }
    if (filters.from) {
      where.push('created_at >= ?');
      params.push(filters.from);
    }
    if (filters.to) {
      where.push('created_at <= ?');
      params.push(filters.to);
    }
    const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await executeQuery<Record<string, unknown>[]>(
      // eslint-disable-next-line no-restricted-syntax -- WHERE fragments are fixed; values use ? placeholders (D-01)
      `SELECT * FROM AuditLog ${clause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const totalRows = await executeQuery<{ count: number }[]>(
      // eslint-disable-next-line no-restricted-syntax -- WHERE fragments are fixed; values use ? placeholders (D-01)
      `SELECT COUNT(*) as count FROM AuditLog ${clause}`,
      params
    );
    return { rows, total: totalRows[0].count };
  },
};
