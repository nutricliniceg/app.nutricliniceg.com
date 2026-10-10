import { describe, it, expect, vi, beforeEach } from 'vitest';
import { notifyPagedAdmins, notifyAllAdmins } from '@/lib/notifications/admin-alerts';
import { notificationService } from '@/lib/notifications/service';
import { userRepository } from '@/lib/db/repositories/users.repo';

vi.mock('@/lib/notifications/service');
vi.mock('@/lib/db/repositories/users.repo');

type Mock = ReturnType<typeof vi.fn>;

const USERS = [
  { id: 'a1', role: 'admin', email: 'a@x.com', name: 'A' },
  { id: 'a2', role: 'super_admin', email: 'b@x.com', name: 'B' },
  { id: 'd1', role: 'doctor', email: 'd@x.com', name: 'D' },
];

describe('admin-alerts fan-out', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (notificationService.notify as unknown as Mock).mockResolvedValue(undefined);
  });

  it('notifies only admin and super_admin recipients', async () => {
    (userRepository.listDoctors as unknown as Mock).mockResolvedValue({ users: USERS, total: 3 });
    await notifyPagedAdmins({ title: 'T', body: 'B' });
    const targets = (notificationService.notify as unknown as Mock).mock.calls.map((c) => c[0].userId);
    expect(targets).toEqual(['a1', 'a2']);
    expect(targets).not.toContain('d1');
  });

  it('passes title, body, type and link through unchanged', async () => {
    (userRepository.listDoctors as unknown as Mock).mockResolvedValue({ users: [USERS[0]], total: 1 });
    await notifyPagedAdmins({ title: 'T', body: 'B', link: '/admin/users' });
    expect(notificationService.notify).toHaveBeenCalledWith({
      userId: 'a1', title: 'T', body: 'B', type: 'system', link: '/admin/users',
    });
  });

  it('omits link when not supplied', async () => {
    (userRepository.listDoctors as unknown as Mock).mockResolvedValue({ users: [USERS[0]], total: 1 });
    await notifyPagedAdmins({ title: 'T', body: 'B' });
    expect(notificationService.notify).toHaveBeenCalledWith({
      userId: 'a1', title: 'T', body: 'B', type: 'system', link: undefined,
    });
  });

  it('isolates per-recipient failures by default (best-effort, CRON-11)', async () => {
    (userRepository.listDoctors as unknown as Mock).mockResolvedValue({ users: [USERS[0], USERS[1]], total: 2 });
    (notificationService.notify as unknown as Mock)
      .mockRejectedValueOnce(new Error('smtp down'))
      .mockResolvedValueOnce(undefined);
    await expect(notifyPagedAdmins({ title: 'T', body: 'B' })).resolves.toBeUndefined();
    // The second admin is still notified after the first one throws.
    expect(notificationService.notify).toHaveBeenCalledTimes(2);
  });

  it('notifyAllAdmins never throws, even when the lookup fails', async () => {
    (userRepository.listAllForBroadcast as unknown as Mock).mockRejectedValue(new Error('db down'));
    await expect(notifyAllAdmins({ title: 'T', body: 'B' })).resolves.toBeUndefined();
    expect(notificationService.notify).not.toHaveBeenCalled();
  });

  it('notifyAllAdmins uses the uncapped broadcast list', async () => {
    (userRepository.listAllForBroadcast as unknown as Mock).mockResolvedValue(USERS);
    await notifyAllAdmins({ title: 'T', body: 'B' });
    expect(userRepository.listAllForBroadcast).toHaveBeenCalledWith(null);
    const targets = (notificationService.notify as unknown as Mock).mock.calls.map((c) => c[0].userId);
    expect(targets).toEqual(['a1', 'a2']);
  });

  it('isolate:false preserves the legacy abort-on-first-failure behaviour', async () => {
    (userRepository.listDoctors as unknown as Mock).mockResolvedValue({ users: [USERS[0], USERS[1]], total: 2 });
    (notificationService.notify as unknown as Mock).mockRejectedValue(new Error('smtp down'));
    await expect(notifyPagedAdmins({ title: 'T', body: 'B', isolate: false })).rejects.toThrow('smtp down');
    expect(notificationService.notify).toHaveBeenCalledTimes(1);
  });
});

describe('admin-alerts deduplication', () => {
  it('no module re-implements the admin fan-out loop', async () => {
    const fs = await import('node:fs');
    for (const f of [
      'lib/auth/auth.service.ts',
      'lib/billing/billing.service.ts',
      'lib/billing/tasks.ts',
      'lib/cron/tasks.ts',
      'lib/cron/runner.ts',
    ]) {
      const src = fs.readFileSync(f, 'utf8');
      // The fan-out shape was: fetch a user list, filter to admin roles, then
      // loop calling notificationService.notify. Assert the list fetch is gone.
      expect(src, f).not.toContain('listDoctors(1, 100)');
      expect(src, f).not.toMatch(/listAllForBroadcast\(null\)[\s\S]{0,200}notificationService\.notify/);
    }
  });
});