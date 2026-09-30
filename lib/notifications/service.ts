import { notificationRepository } from '@/lib/db/repositories/notifications.repo';

export interface Notification {
  userId: string;
  title: string;
  body: string;
  type: 'new_message' | 'new_report' | 'subscription' | 'system';
  link?: string;
}

export const notificationService = {
  notify: async (data: Notification): Promise<void> => {
    await notificationRepository.insert(data);
  },

  getUnreadCount: async (userId: string): Promise<number> => {
    return notificationRepository.countUnread(userId);
  },
};
