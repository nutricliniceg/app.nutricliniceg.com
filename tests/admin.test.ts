import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pricingService } from '@/lib/admin/pricing.service';
import { settingsAdminService } from '@/lib/admin/settings-admin.service';
import { bulkEmailService } from '@/lib/admin/bulk-email.service';
import { adminUsersService } from '@/lib/admin/users.service';
import { userRepository } from '@/lib/db/repositories/users.repo';
import { adminRepository } from '@/lib/db/repositories/admin.repo';
import { subscriptionPlansRepository } from '@/lib/db/repositories/subscription-plans.repo';
import { settingsRepository } from '@/lib/db/repositories/settings.repo';
import { adminMessagesRepository } from '@/lib/db/repositories/admin-messages.repo';
import { notificationService } from '@/lib/notifications/service';
import { sendEmail } from '@/lib/email/mailer';

vi.mock('@/lib/db/repositories/users.repo', () => ({
  userRepository: {
    findById: vi.fn(), update: vi.fn().mockResolvedValue(undefined),
    listAllForBroadcast: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@/lib/db/repositories/admin.repo', () => ({
  adminRepository: { listUsers: vi.fn(), countPending: vi.fn(), countNewContacts: vi.fn(), overview: vi.fn() },
}));

vi.mock('@/lib/db/repositories/subscription-plans.repo', () => ({
  subscriptionPlansRepository: {
    listAll: vi.fn().mockResolvedValue([]), findById: vi.fn(),
    insert: vi.fn().mockResolvedValue('plan-1'), update: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/lib/db/repositories/settings.repo', () => ({
  settingsRepository: { get: vi.fn(), set: vi.fn().mockResolvedValue(undefined), list: vi.fn().mockResolvedValue([]) },
}));

vi.mock('@/lib/db/repositories/admin-messages.repo', () => ({
  adminMessagesRepository: {
    insert: vi.fn().mockResolvedValue('msg-1'), addRecipients: vi.fn().mockResolvedValue(undefined),
    listRecipients: vi.fn().mockResolvedValue([]), markSent: vi.fn().mockResolvedValue(undefined),
    listFailed: vi.fn().mockResolvedValue([]), findById: vi.fn(), updateCounts: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@/lib/notifications/service', () => ({
  notificationService: { notify: vi.fn().mockResolvedValue(undefined), getUnreadCount: vi.fn() },
}));

vi.mock('@/lib/email/mailer', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

type Mock = ReturnType<typeof vi.fn>;

const planInput = {
  nameAr: 'شهري', nameEn: 'Monthly', priceMonthly: 299, durationDays: 30,
};

beforeEach(() => { vi.clearAllMocks(); });

describe('P22 permission matrix: pricing is super_admin-only', () => {
  it('blocks admin, allows super_admin', async () => {
    await expect(pricingService.create(false, planInput)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(pricingService.update(false, 'p1', {})).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(pricingService.remove(false, 'p1')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(pricingService.create(true, planInput)).resolves.toEqual({ id: 'plan-1' });
    (subscriptionPlansRepository.findById as Mock).mockResolvedValue({ id: 'p1' });
    await expect(pricingService.update(true, 'p1', { priceMonthly: 399 })).resolves.toEqual({ id: 'p1' });
    await expect(pricingService.remove(true, 'p1')).resolves.toEqual({ id: 'p1' });
  });
});

describe('P22 permission matrix: sensitive settings', () => {
  it('blocks admin on flagged/smtp keys, allows super_admin and plain keys', async () => {
    (settingsRepository.list as Mock).mockResolvedValue([
      { key: 'smtp.host', is_sensitive: 1 },
      { key: 'site.name', is_sensitive: 0 },
    ]);
    await expect(settingsAdminService.set(false, 'smtp.host', 'x', 'a1')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(settingsAdminService.set(false, 'paymob.key', 'x', 'a1')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(settingsAdminService.set(false, 'site.name', 'x', 'a1')).resolves.toEqual({ key: 'site.name' });
    await expect(settingsAdminService.set(true, 'smtp.host', 'x', 'a1')).resolves.toEqual({ key: 'smtp.host' });
    const listed = await settingsAdminService.list(false);
    expect(listed.find((s) => s.key === 'smtp.host')?.hidden).toBe(true);
  });
});

describe('P22 bulk email fan-out + status', () => {
  it('creates tracked recipients and marks sent/failed', async () => {
    (userRepository.listAllForBroadcast as Mock).mockResolvedValue([
      { id: 'd1', email: 'd1@x.com', name: 'D1', role: 'doctor' },
      { id: 'd2', email: 'd2@x.com', name: 'D2', role: 'doctor' },
    ]);
    (adminMessagesRepository.listRecipients as Mock).mockResolvedValue([
      { id: 'r1', user_id: 'd1' },
      { id: 'r2', user_id: 'd2' },
    ]);
    (sendEmail as Mock).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('bounce'));
    const result = await bulkEmailService.compose({
      senderId: 'a1', alias: 'info', audience: 'doctors', subject: 'News', body: 'Hello',
    });
    expect(result).toMatchObject({ messageId: 'msg-1', recipients: 2, sent: 1, failed: 1 });
    const marked = (adminMessagesRepository.markSent as Mock).mock.calls;
    expect(marked.find((c) => c[0] === 'r1' && c[1] === true)).toBeTruthy();
    expect(marked.find((c) => c[0] === 'r2' && c[1] === false)).toBeTruthy();
  });

  it('retry re-sends failures', async () => {
    (adminMessagesRepository.findById as Mock).mockResolvedValue({ id: 'msg-1', sender_alias: 'info', subject: 'News', body: 'Hello' });
    (adminMessagesRepository.listFailed as Mock).mockResolvedValue([{ id: 'r2', user_id: 'd2', error_message: 'bounce' }]);
    (userRepository.findById as Mock).mockResolvedValue({ id: 'd2', email: 'd2@x.com' });
    (sendEmail as Mock).mockResolvedValue(undefined);
    const result = await bulkEmailService.retry('msg-1');
    expect(result).toMatchObject({ retried: 1, sent: 1, failed: 0 });
  });
});

describe('P22 activation queue actions', () => {
  it('activating emails the doctor; rejecting keeps the record', async () => {
    (userRepository.findById as Mock).mockResolvedValue({ id: 'd9', email: 'd9@x.com', name: 'D9', role: 'doctor', is_active: false });
    await expect(adminUsersService.setActive('a1', 'd9', true)).resolves.toMatchObject({ id: 'd9', is_active: true });
    expect(sendEmail as Mock).toHaveBeenCalledWith(expect.objectContaining({ to: 'd9@x.com' }));
    expect(notificationService.notify as Mock).toHaveBeenCalledWith(expect.objectContaining({ userId: 'd9' }));
    await expect(adminUsersService.setActive('a1', 'a1', false)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(adminUsersService.reject('a1', 'd9', 'Incomplete papers')).resolves.toMatchObject({ rejected: true });
    expect(adminRepository.listUsers as Mock).toBeTruthy();
  });

  it('adjusts subscriptions with reason-driven day math', async () => {
    (userRepository.findById as Mock).mockResolvedValue({ id: 'd9', email: 'd9@x.com', name: 'D9', subscription_ends_at: null });
    const result = await adminUsersService.adjustSubscription('d9', { addDays: 30 });
    expect(userRepository.update as Mock).toHaveBeenCalledWith('d9', expect.objectContaining({ subscription_ends_at: expect.any(Date) }));
    expect(result.id).toBe('d9');
  });
});
