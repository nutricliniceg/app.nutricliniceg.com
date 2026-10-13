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
      // P32-AUDITFIX: Notification.id is varchar(36) PRIMARY KEY NOT NULL with
      // no default; omitting it made MySQL bind '' and every notification after
      // the first failed with ER_DUP_ENTRY. The id is now bound first.
      expect.arrayContaining(['user-123', 'Test Title', 'Test body', 'new_message', '/messages/123'])
    );
    const params = (executeQuery as any).mock.calls[0][1] as unknown[];
    expect(params[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
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