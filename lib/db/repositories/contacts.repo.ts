import { executeQuery } from '@/lib/db/pool';
import { randomUUID } from 'crypto';

export interface ContactMessageRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  subject: string | null;
  message: string;
  status: 'new' | 'read' | 'replied' | 'archived';
  handled_by: string | null;
  reply_text: string | null;
  created_at: Date;
}

export const contactsRepository = {
  async insert(data: { name: string; email: string; phone?: string | null; subject?: string | null; message: string; ipHash: string | null }): Promise<string> {
    const id = randomUUID();
    await executeQuery(
      'INSERT INTO ContactMessage (id, name, email, phone, subject, message, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, data.name, data.email, data.phone ?? null, data.subject ?? null, data.message, data.ipHash]
    );
    return id;
  },

  async list(status?: string): Promise<ContactMessageRow[]> {
    if (status) {
      return executeQuery<ContactMessageRow[]>('SELECT * FROM ContactMessage WHERE status = ? ORDER BY created_at DESC LIMIT 200', [status]);
    }
    return executeQuery<ContactMessageRow[]>('SELECT * FROM ContactMessage ORDER BY created_at DESC LIMIT 200');
  },

  async updateStatus(id: string, status: 'new' | 'read' | 'replied' | 'archived', handledBy: string | null, replyText: string | null = null): Promise<void> {
    await executeQuery(
      'UPDATE ContactMessage SET status = ?, handled_by = ?, reply_text = COALESCE(?, reply_text) WHERE id = ?',
      [status, handledBy, replyText, id]
    );
  },
};
