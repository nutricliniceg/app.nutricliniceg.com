import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'crypto';
import { NextRequest } from 'next/server';
import { billingService } from '@/lib/billing/billing.service';
import { lifecycleState, bannerFor, detectMismatches, GRACE_DAYS } from '@/lib/billing/lifecycle';
import { verifyPaymobHmac, paymobConcatenated } from '@/lib/billing/paymob';
import { billingRepository } from '@/lib/db/repositories/billing.repo';
import { userRepository } from '@/lib/db/repositories/users.repo';
import { subscriptionPlansRepository } from '@/lib/db/repositories/subscription-plans.repo';
import { settingsRepository } from '@/lib/db/repositories/settings.repo';
import { notificationService } from '@/lib/notifications/service';
import { sendEmail } from '@/lib/email/mailer';
import { POST as webhookPOST } from '@/app/api/billing/paymob/webhook/route';

vi.mock('@/lib/db/repositories/billing.repo', () => ({
  billingRepository: {
    latestForUser: vi.fn(), insertSubscription: vi.fn().mockResolvedValue('sub-1'),
    updateSubscription: vi.fn().mockResolvedValue(undefined), markReminder: vi.fn().mockResolvedValue(undefined),
    expiringCandidates: vi.fn().mockResolvedValue([]), reminderCandidates: vi.fn().mockResolvedValue([]),
    insertManualRequest: vi.fn().mockResolvedValue('mreq-1'), listManualRequests: vi.fn(),
    findManualRequest: vi.fn(), reviewManualRequest: vi.fn().mockResolvedValue(undefined),
    findPaymobTxn: vi.fn(), insertPaymobTxn: vi.fn().mockResolvedValue('txn-1'),
    successfulTxns: vi.fn().mockResolvedValue([]), subscriptionsForUser: vi.fn().mockResolvedValue([]),
    findSubscriptionById: vi.fn(),
  },
}));

vi.mock('@/lib/db/repositories/users.repo', () => ({
  userRepository: {
    findById: vi.fn(), update: vi.fn().mockResolvedValue(undefined),
    listDoctors: vi.fn().mockResolvedValue({ users: [], total: 0 }),
  },
}));

vi.mock('@/lib/db/repositories/subscription-plans.repo', () => ({
  subscriptionPlansRepository: { findById: vi.fn(), listAll: vi.fn().mockResolvedValue([]) },
}));

vi.mock('@/lib/db/repositories/settings.repo', () => ({
  settingsRepository: { get: vi.fn().mockResolvedValue(null), set: vi.fn(), list: vi.fn() },
}));

vi.mock('@/lib/notifications/service', () => ({
  notificationService: { notify: vi.fn().mockResolvedValue(undefined), getUnreadCount: vi.fn() },
}));

vi.mock('@/lib/email/mailer', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

type Mock = ReturnType<typeof vi.fn>;

const SECRET = 'hmac-test-secret-xyz';

function signedTxn(overrides = {}) {
  const obj = {
    amount_cents: 29900, created_at: '2026-09-22T10:00:00Z', currency: 'EGP', error_occured: false,
    has_parent_transaction: false, id: 424242, integration_id: 123, is_3d_secure: true, is_auth: false,
    is_capture: false, is_refunded: false, is_standalone_payment: true, is_voided: false,
    order: { id: 777 }, owner: 'u1', pending: false,
    source_data: { pan: '2346', sub_type: 'Mastercard', type: 'card' },
    success: true, ...overrides,
  };
  const hmac = createHmac('sha512', SECRET).update(paymobConcatenated(obj)).digest('hex');
  return { obj, hmac };
}

beforeEach(() => {
  vi.clearAllMocks();
  (settingsRepository.get as Mock).mockImplementation(async (key: string) => {
    if (key === 'billing.paymob.hmac_secret') return SECRET;
    return null;
  });
});

describe('P24 webhook HMAC (R13)', () => {
  it('accepts documented vectors and rejects tampering', () => {
    const { obj, hmac } = signedTxn();
    expect(verifyPaymobHmac(obj, hmac, SECRET)).toBe(true);
    expect(verifyPaymobHmac({ ...obj, amount_cents: 1 }, hmac, SECRET)).toBe(false);
    expect(verifyPaymobHmac(obj, hmac, 'wrong')).toBe(false);
  });

  it('route rejects bad signatures with 403', async () => {
    const { obj } = signedTxn();
    const res = await webhookPOST(new NextRequest('http://localhost/api/billing/paymob/webhook', {
      method: 'POST', body: JSON.stringify({ hmac: 'bogus', obj }),
    }));
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('BAD_SIGNATURE');
  });
});

describe('P24 webhook idempotency + auto-activation (D-20)', () => {
  it('replays return stored results without side effects', async () => {
    const { obj, hmac } = signedTxn();
    (billingRepository.findPaymobTxn as Mock).mockResolvedValue({ id: 't1', user_id: 'u1' });
    (billingRepository.subscriptionsForUser as Mock).mockResolvedValue([{ id: 'sub-9' }]);
    const out = await billingService.handlePaymobWebhook({ hmac, obj } as unknown as Record<string, unknown>);
    expect(out).toEqual({ subscriptionId: 'sub-9', replayed: true });
    expect(billingRepository.insertPaymobTxn as Mock).not.toHaveBeenCalled();
  });

  it('success instantly unlocks a just-registered doctor', async () => {
    const { obj, hmac } = signedTxn();
    (billingRepository.findPaymobTxn as Mock).mockResolvedValue(null);
    (userRepository.findById as Mock).mockResolvedValue({ id: 'u1', email: 'doc@x.com', name: 'Doc', is_active: false });
    (subscriptionPlansRepository.findById as Mock).mockResolvedValue({ id: 'p1', duration_days: 30 });
    const extra = { payment_key_claims: { extra: { user_id: 'u1', plan_id: 'p1' } } };
    const out = await billingService.handlePaymobWebhook({ hmac, obj: { ...obj, ...extra } } as unknown as Record<string, unknown>);
    expect(out.replayed).toBe(false);
    expect(billingRepository.insertPaymobTxn as Mock).toHaveBeenCalled();
    expect(billingRepository.insertSubscription as Mock).toHaveBeenCalledWith(expect.objectContaining({ status: 'active', paymentMethod: 'paymob' }));
    expect(userRepository.update as Mock).toHaveBeenCalledWith('u1', { is_active: true });
    expect(sendEmail as Mock).toHaveBeenCalledWith(expect.objectContaining({ to: 'doc@x.com' }));
  });
});

describe('P24 grace transitions + banner (R16)', () => {
  const ends = new Date('2026-09-20T00:00:00Z');
  it('active → grace → expired across the 3-day window', () => {
    expect(lifecycleState({ status: 'active', endsAt: ends }, new Date('2026-09-20T00:00:00Z'))).toBe('active');
    expect(lifecycleState({ status: 'active', endsAt: ends }, new Date('2026-09-21T12:00:00Z'))).toBe('grace');
    expect(lifecycleState({ status: 'grace', endsAt: ends }, new Date('2026-09-21T12:00:00Z'))).toBe('grace');
    expect(lifecycleState({ status: 'active', endsAt: ends }, new Date(`2026-09-${20 + GRACE_DAYS + 1}T00:00:01Z`))).toBe('expired');
    expect(lifecycleState({ status: 'cancelled', endsAt: ends }, new Date('2026-10-01T00:00:00Z'))).toBe('cancelled');
  });

  it('banner states drive the doctor UI', () => {
    expect(bannerFor('active')).toBe('none');
    expect(bannerFor('grace')).toBe('grace');
    expect(bannerFor('expired')).toBe('expired');
  });
});

describe('P24 manual approval + reconciliation', () => {
  it('approval extends days and notifies; rejection needs the record', async () => {
    (billingRepository.findManualRequest as Mock).mockResolvedValue({ id: 'm1', user_id: 'u1', plan_id: 'p1', method: 'manual', reference: 'TRX-1', status: 'pending' });
    (userRepository.findById as Mock).mockResolvedValue({ id: 'u1', email: 'u@x.com', name: 'U' });
    (subscriptionPlansRepository.findById as Mock).mockResolvedValue({ id: 'p1', duration_days: 30 });
    (billingRepository.latestForUser as Mock).mockResolvedValue(null);
    const okResult = await billingService.reviewManual('a1', 'm1', true, null);
    expect(okResult.subscriptionId).toBe('sub-1');
    expect(billingRepository.reviewManualRequest as Mock).toHaveBeenCalledWith('m1', 'approved', 'a1', null);
    const noResult = await billingService.reviewManual('a1', 'm1', false, 'Illegible receipt');
    expect(noResult.subscriptionId).toBeNull();
    expect(sendEmail as Mock).toHaveBeenCalledWith(expect.objectContaining({ to: 'u@x.com' }));
  });

  it('detects paid-but-not-extended mismatches', () => {
    const mismatches = detectMismatches(
      [{ user_id: 'u1', plan_id: 'p1', amount_cents: 29900, success: true }],
      [{ user_id: 'u1', plan_id: 'p2', status: 'active', ends_at: new Date() }]
    );
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0].kind).toBe('paid_not_extended');
    expect(detectMismatches(
      [{ user_id: 'u1', plan_id: 'p1', amount_cents: 29900, success: true }],
      [{ user_id: 'u1', plan_id: 'p1', status: 'active', ends_at: new Date() }]
    )).toHaveLength(0);
  });
});
