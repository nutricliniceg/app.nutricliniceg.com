import { randomUUID } from 'crypto';
import { executeQuery } from '@/lib/db/pool';

export interface NotificationInsert {
  userId: string;
  title: string;
  body: string;
  type: string;
  link?: string | null;
}

export const notificationRepository = {
  // Notification.id is `varchar(36) PRIMARY KEY` NOT NULL with NO default; this
  // insert omitted it, so MySQL bound '' and every call after the first failed
  // with ER_DUP_ENTRY — silently stopping all notifications. Same class as the
  // AuditLog defect: generate the id here, bind it first (P33 convention).
  insert: async (data: NotificationInsert): Promise<void> => {
    await executeQuery(
      'INSERT INTO Notification (id, user_id, title, body, type, link) VALUES (?, ?, ?, ?, ?, ?)',
      [randomUUID(), data.userId, data.title, data.body, data.type, data.link ?? null]
    );
  },

  countUnread: async (userId: string): Promise<number> => {
    const rows = await executeQuery<{ count: number }[]>(
      'SELECT COUNT(*) as count FROM Notification WHERE user_id = ? AND is_read = false',
      [userId]
    );
    return rows[0].count;
  },
};
