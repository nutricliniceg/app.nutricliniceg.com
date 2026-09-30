import { executeQuery } from '@/lib/db/pool';
import { randomUUID } from 'crypto';

export interface AdminMessageInsert {
  senderId: string;
  senderAlias: 'no-reply' | 'info' | 'admin';
  recipientType: 'all' | 'doctors' | 'selected' | 'admins';
  subject: string;
  body: string;
  sendViaEmail: boolean;
  sendViaInApp: boolean;
}

export interface AdminMessageRow {
  id: string;
  sender_alias: string;
  recipient_type: string;
  subject: string;
  sent_count: number;
  failed_count: number;
  created_at: Date;
}

export interface AdminMessageHeader {
  id: string;
  sender_alias: string;
  subject: string;
  body: string;
}

export const adminMessagesRepository = {
  async findById(messageId: string): Promise<AdminMessageHeader | null> {
    const rows = await executeQuery<AdminMessageHeader[]>(
      'SELECT id, sender_alias, subject, body_content AS body FROM AdminMessage WHERE id = ?',
      [messageId]
    );
    return rows.length > 0 ? rows[0] : null;
  },
  async insert(data: AdminMessageInsert): Promise<string> {
    const id = randomUUID();
    await executeQuery(
      `INSERT INTO AdminMessage (id, sender_id, sender_alias, recipient_type, subject, body_content, send_via_email, send_via_in_app)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, data.senderId, data.senderAlias, data.recipientType, data.subject, data.body, data.sendViaEmail, data.sendViaInApp]
    );
    return id;
  },

  async addRecipients(messageId: string, userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;
    // PF-02: single multi-row INSERT (was one INSERT per recipient).
    const placeholders = userIds.map(() => '(?, ?, ?)').join(',');
    const values: string[] = [];
    for (const userId of userIds) values.push(randomUUID(), messageId, userId);
    await executeQuery(
      // eslint-disable-next-line no-restricted-syntax -- placeholders are bound per row; values use ? (D-01)
      `INSERT INTO AdminMessageRecipient (id, message_id, user_id) VALUES ${placeholders}`,
      values
    );
  },

  async listRecipients(messageId: string): Promise<Array<{ id: string; user_id: string }>> {
    return executeQuery<Array<{ id: string; user_id: string }>>(
      'SELECT id, user_id FROM AdminMessageRecipient WHERE message_id = ?',
      [messageId]
    );
  },

  async markSent(recipientId: string, ok: boolean, error: string | null = null): Promise<void> {
    await executeQuery(
      "UPDATE AdminMessageRecipient SET email_status = ?, error_message = ?, sent_at = ? WHERE id = ?",
      [ok ? 'sent' : 'failed', error, ok ? new Date() : null, recipientId]
    );
  },

  async listFailed(messageId: string): Promise<Array<{ id: string; user_id: string; error_message: string | null }>> {
    return executeQuery<Array<{ id: string; user_id: string; error_message: string | null }>>(
      "SELECT id, user_id, error_message FROM AdminMessageRecipient WHERE message_id = ? AND email_status = 'failed'",
      [messageId]
    );
  },

  async updateCounts(messageId: string): Promise<void> {
    await executeQuery(
      `UPDATE AdminMessage SET sent_count = (SELECT COUNT(*) FROM AdminMessageRecipient WHERE message_id = ? AND email_status = 'sent'),
        failed_count = (SELECT COUNT(*) FROM AdminMessageRecipient WHERE message_id = ? AND email_status = 'failed')
       WHERE id = ?`,
      [messageId, messageId, messageId]
    );
  },

  async list(limit = 50): Promise<AdminMessageRow[]> {
    return executeQuery<AdminMessageRow[]>(
      'SELECT id, sender_alias, recipient_type, subject, sent_count, failed_count, created_at FROM AdminMessage ORDER BY created_at DESC LIMIT ?',
      [limit]
    );
  },

  async recipientUserIds(messageId: string): Promise<string[]> {
    const rows = await executeQuery<Array<{ user_id: string }>>(
      'SELECT user_id FROM AdminMessageRecipient WHERE message_id = ?',
      [messageId]
    );
    return rows.map((r) => r.user_id);
  },
};
