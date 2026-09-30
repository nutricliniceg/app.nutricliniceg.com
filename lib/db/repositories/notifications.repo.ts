import { executeQuery } from '@/lib/db/pool';

export interface NotificationInsert {
  userId: string;
  title: string;
  body: string;
  type: string;
  link?: string | null;
}

export const notificationRepository = {
  insert: async (data: NotificationInsert): Promise<void> => {
    await executeQuery(
      'INSERT INTO Notification (user_id, title, body, type, link) VALUES (?, ?, ?, ?, ?)',
      [data.userId, data.title, data.body, data.type, data.link ?? null]
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
