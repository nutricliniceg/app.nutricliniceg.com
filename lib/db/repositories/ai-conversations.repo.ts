import { executeQuery } from '@/lib/db/pool';
import { randomUUID } from 'crypto';

export interface AiConversationRow {
  id: string;
  doctor_id: string;
  patient_id: string | null;
  title: string | null;
  is_pinned: boolean | number;
  is_archived: boolean | number;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface AiMessageRow {
  id: string;
  conversation_id: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  attachments: string | null;
  tokens_used: number | null;
  created_at: Date;
}

export interface ConversationFilters {
  q?: string;
  archived?: boolean;
  patientId?: string | null;
  trash?: boolean;
}

export const aiConversationsRepository = {
  insert: async (doctorId: string, title: string | null): Promise<string> => {
    const id = randomUUID();
    await executeQuery('INSERT INTO AiConversation (id, doctor_id, title) VALUES (?, ?, ?)', [id, doctorId, title]);
    return id;
  },

  findOwned: async (id: string, doctorId: string): Promise<AiConversationRow | null> => {
    const rows = await executeQuery<AiConversationRow[]>(
      'SELECT * FROM AiConversation WHERE id = ? AND doctor_id = ?',
      [id, doctorId]
    );
    return rows.length > 0 ? rows[0] : null;
  },

  list: async (doctorId: string, filters: ConversationFilters): Promise<AiConversationRow[]> => {
    if (filters.trash) {
      return executeQuery<AiConversationRow[]>(
        'SELECT * FROM AiConversation WHERE doctor_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 100',
        [doctorId]
      );
    }
    const where = ['doctor_id = ?', 'deleted_at IS NULL'];
    const params: Array<string | number | boolean> = [doctorId];
    if (filters.archived !== undefined) {
      where.push('is_archived = ?');
      params.push(filters.archived);
    }
    if (filters.patientId !== undefined) {
      if (filters.patientId === null) where.push('patient_id IS NULL');
      else {
        where.push('patient_id = ?');
        params.push(filters.patientId);
      }
    }
    if (filters.q) {
      where.push('title LIKE ?');
      params.push(`%${filters.q}%`);
    }
    // eslint-disable-next-line no-restricted-syntax -- WHERE fragments are fixed; values use ? placeholders (D-01)
    const sql = `SELECT * FROM AiConversation WHERE ${where.join(' AND ')} ORDER BY is_pinned DESC, updated_at DESC LIMIT 100`;
    const rows = await executeQuery<AiConversationRow[]>(sql, params);
    if (!filters.q) return rows;
    // Content search: conversations whose messages match (bounded).
    const hits = await executeQuery<Array<{ conversation_id: string }>>(
      'SELECT DISTINCT m.conversation_id FROM AiMessage m INNER JOIN AiConversation c ON c.id = m.conversation_id WHERE c.doctor_id = ? AND c.deleted_at IS NULL AND m.content LIKE ? LIMIT 100',
      [doctorId, `%${filters.q}%`]
    );
    const hitIds = new Set(hits.map((h) => h.conversation_id));
    const ids = new Set(rows.map((r) => r.id));
    if (hitIds.size === 0) return rows;
    const extra = await executeQuery<AiConversationRow[]>(
      'SELECT * FROM AiConversation WHERE doctor_id = ? AND deleted_at IS NULL',
      [doctorId]
    );
    return [...rows, ...extra.filter((r) => hitIds.has(r.id) && !ids.has(r.id))].slice(0, 100);
  },

  update: async (id: string, doctorId: string, patch: { title?: string | null; isPinned?: boolean; isArchived?: boolean; patientId?: string | null }): Promise<void> => {
    const fields: string[] = [];
    const values: Array<string | boolean | null> = [];
    if (patch.title !== undefined) {
      fields.push('title = ?');
      values.push(patch.title);
    }
    if (patch.isPinned !== undefined) {
      fields.push('is_pinned = ?');
      values.push(patch.isPinned);
    }
    if (patch.isArchived !== undefined) {
      fields.push('is_archived = ?');
      values.push(patch.isArchived);
    }
    if (patch.patientId !== undefined) {
      fields.push('patient_id = ?');
      values.push(patch.patientId);
    }
    if (fields.length === 0) return;
    values.push(id, doctorId);
    // eslint-disable-next-line no-restricted-syntax -- SET columns are fixed literals; values use ? placeholders (D-01)
    await executeQuery(`UPDATE AiConversation SET ${fields.join(', ')} WHERE id = ? AND doctor_id = ?`, values);
  },

  softDelete: async (id: string, doctorId: string): Promise<void> => {
    await executeQuery('UPDATE AiConversation SET deleted_at = ? WHERE id = ? AND doctor_id = ? AND deleted_at IS NULL', [new Date(), id, doctorId]);
  },

  restore: async (id: string, doctorId: string): Promise<void> => {
    await executeQuery('UPDATE AiConversation SET deleted_at = NULL WHERE id = ? AND doctor_id = ?', [id, doctorId]);
  },

  insertMessage: async (conversationId: string, role: 'system' | 'user' | 'assistant', content: string, attachments?: unknown): Promise<string> => {
    const id = randomUUID();
    await executeQuery(
      'INSERT INTO AiMessage (id, conversation_id, role, content, attachments) VALUES (?, ?, ?, ?, ?)',
      [id, conversationId, role, content, attachments ? JSON.stringify(attachments) : null]
    );
    return id;
  },

  listMessages: async (conversationId: string, doctorId: string): Promise<AiMessageRow[]> => {
    const rows = await executeQuery<AiMessageRow[]>(
      `SELECT m.* FROM AiMessage m INNER JOIN AiConversation c ON c.id = m.conversation_id
       WHERE m.conversation_id = ? AND c.doctor_id = ? ORDER BY m.created_at ASC LIMIT 500`,
      [conversationId, doctorId]
    );
    return rows;
  },

  lastSystemMessage: async (conversationId: string, doctorId: string): Promise<AiMessageRow | null> => {
    const rows = await executeQuery<AiMessageRow[]>(
      `SELECT m.* FROM AiMessage m INNER JOIN AiConversation c ON c.id = m.conversation_id
       WHERE m.conversation_id = ? AND c.doctor_id = ? AND m.role = 'system' ORDER BY m.created_at DESC LIMIT 1`,
      [conversationId, doctorId]
    );
    return rows.length > 0 ? rows[0] : null;
  },
};
