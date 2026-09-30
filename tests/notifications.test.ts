import { describe, it, expect, vi, beforeEach } from 'vitest';
import { notificationService } from '@/lib/notifications/service';
import { executeQuery } from '@/lib/db/pool';

vi.mock('@/lib/db/pool');

describe('Notification Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create notification', async () => {
    (executeQuery as any).mockResolvedValue([]);

    await notificationService.notify({
      userId: 'user-123',
      title: 'Test Title',
      body: 'Test body',
      type: 'new_message',
      link: '/messages/123',
    });

    expect(executeQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO Notification'),
      ['user-123', 'Test Title', 'Test body', 'new_message', '/messages/123']
    );
  });

  it('should get unread count', async () => {
    (executeQuery as any).mockResolvedValue([{ count: 5 }]);

    const count = await notificationService.getUnreadCount('user-123');
    expect(count).toBe(5);
    expect(executeQuery).toHaveBeenCalledWith(
      expect.stringContaining('SELECT COUNT(*)'),
      ['user-123']
    );
  });
});